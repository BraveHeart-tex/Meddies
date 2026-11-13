# Deployment

Releases, failed-run diagnosis and recovery. One-time production setup:
[deployment setup](deployment-setup.md).

## Worker and database

The production D1 binding is `meddies` in `worker/wrangler.jsonc`. Set
`MEDICINES_WORKER_SECRET` with `wrangler secret put`, and the matching secret and HTTPS
Worker origin as Vercel Production variables; redeploy Vercel after changing them.
Cloudflare management credentials stay in the protected release environment or on the
maintainer machine. Keep synthetic feasibility databases separate from production.
Manual Wrangler commands are for [coordinated recovery](#failure-and-recovery) only.

## Verify workflow

`.github/workflows/verify.yml` runs on pull requests and is called by Release before
production mutations, using `.node-version`, `packageManager` and a frozen install. It has
read-only repository access and no production environment or secrets. Its one `Verify` job
sets up dependencies once, then runs lint, format check, typecheck, production build,
Worker build and every non-`@visual` journey; any failing step blocks release. Vitest runs
only in `pnpm verify:local`, and `scripts/verify.mjs` is the local and manual-recovery
path. The production build sets `CI_SKIP_BUILD_TYPECHECK=1` after the explicit typecheck;
Vercel and local journey builds keep the check. ESLint and Prettier caches stay local in
`.cache`.

Verify and Release restore installed `node_modules` with an exact cache key: OS,
architecture, resolved Node version, and hashes of the lockfile, package manifest and pnpm
install policy. A miss runs a frozen install; there are no prefix restores. Only main runs
save the dependency cache, immediately after a successful install.

Verify also restores Turbopack's `.next/cache`, keyed by OS, a hash of `pnpm-lock.yaml`
and `next.config.ts`, and the commit SHA, with prefix restore keys. Only main runs save it,
so pull requests cannot poison or evict it. To clear it:

```sh
gh cache list --key Linux-next-cache- --limit 1000 --json id --jq '.[].id' \
  | xargs -n1 gh cache delete
```

## Ordered releases

A **non-runtime-only** commit changes only `docs/**` or `**/*.md`. `.agents` scripts remain CI
inputs. Tests pin the workflow patterns and prove release-guard parity.

`.github/workflows/release.yml` runs on `main` pushes, except non-runtime-only ones, and on
manual dispatch on `main`, which always runs. It calls the single Verify job for the event
SHA, then enters the `production` environment. Before dependency setup, Verify checks current
main: a SHA superseded by any runtime commit succeeds early without journeys, and its release
job is skipped. Head and non-runtime-only advances proceed; lookup or history errors fail
closed. The release job directly requires Verify success and its eligible output.
A newer push cancels an in-progress Verify, and the newer Verify starts without waiting.
A separate non-canceling concurrency group on the release job covers every mutation:

1. Before any mutation, require the release SHA to be an ancestor of current main.
   Allow newer main commits only when every intervening commit is non-runtime-only. Any
   runtime change (even if later reverted), missing history or comparison failure rejects
   the release.
2. Apply pending remote D1 migrations with Wrangler's migration ledger.
3. Deploy that SHA's Worker, tagged with the SHA.
4. Deploy that checkout to Vercel Production with `githubCommitSha` metadata.
5. Inspect the public production alias and require it to point to the ready
   immutable deployment just created. GET that alias (expect 200) and the
   unauthenticated Worker medicine endpoint (expect 401). No medicine data is
   read or written. Generated deployment URLs may remain protected by Vercel.

The Vercel CLI is locked in the root dependencies. Its optional `koffi` build is
disabled; releases use remote Vercel builds, not local native build tooling.
No production environment files or deployable build artifacts are uploaded by Actions;
Release reuses Verify's dependency cache ([Verify workflow](#verify-workflow)).
Alias verification calls Vercel's read-only deployment API with an explicit
`teamId` from `VERCEL_ORG_ID`, using `VERCEL_TOKEN` from the environment. It checks
the ready production deployment URL, project ID and commit SHA. This avoids the
personal-user lookup performed by `vercel inspect`, which can fail with
`User not found` for deployment credentials even after a successful deploy.
CLI output identifies the stage and SHA; the Actions summary records the result
and deployment URL. These smoke probes establish reachability and the Worker auth
gate, not Google callback correctness, authenticated D1 reads or medication behavior.
Check those separately when their configuration changes.

GitHub concurrency can replace pending releases and does not guarantee FIFO order.
The running release is never canceled by a newer push, and two release jobs never run
at once. Main is linear, so a commit is proven by the latest green Release run
containing it; a canceled Verify or skipped release on an older commit is expected.
The latest main commit includes the migrations of superseded commits. Do not manually
cancel an active release or run manual production commands concurrently.

### Diagnosing a failed run

Find the failed step, then follow the matching recovery below:

```sh
gh run list --workflow release.yml --limit 5
gh run view <run-id> --log-failed
```

- **Verify failed** (lint, format, typecheck, build or a journey): treat it as a code
  failure on that commit. Journey traces and screenshots are in the
  `browser-artifacts-<attempt>` artifact (`gh run download <run-id> -n browser-artifacts-1`).
  For a failure the change did not cause, follow
  [unrelated CI failure](verification.md#running-journeys).
- **Release job failed:** the log names the stage (`preflight`, `migrations`, `worker`,
  `app` or `smoke`); read what that stage leaves in production under Failure and recovery.

Agents diagnose, fix code failures with a new commit and report a failed release stage in
the active issue. Re-runs, dispatches and manual recovery are the maintainer's.

### Failure and recovery

Verify failing prevents the release job from starting. A missing setup variable or
credential stops preflight. Migration failure stops Worker and app; Worker failure
stops app; app or smoke failure leaves already completed stages in production.
Inspect the run's SHA and stage before retrying. A smoke failure may mean the app
is already live. Inspect Vercel deployment status and Worker version before acting.
Do not infer rollback from a failed run.

Prefer **Re-run all jobs** on the failed run while its SHA is still main's head.
This repeats verification and the entire ordered sequence for the same checkout.
Wrangler skips applied migrations, including releases with no pending migrations.
Do not use **Re-run failed jobs** as the normal recovery path since it skips checks.
If main has advanced with runtime changes, release the latest reviewed main commit
instead; stale reruns are rejected before mutation and would cancel the newer Verify,
so do not start them. Dispatch Release on main to recover a skipped run.

For manual recovery, coordinate with maintainers so no Actions release is active
or can begin, then use a clean checkout of the intended reviewed SHA:

```sh
pnpm install --frozen-lockfile
node scripts/verify.mjs
export GITHUB_SHA="$(git rev-parse HEAD)"
# Supply the same scoped secrets/variables as the production environment.
# RELEASE_SETUP_CONFIRMED=true asserts the same setup review for manual execution.
bash scripts/release.sh
```

Individual commands remain available when diagnosing a failed stage:

```sh
pnpm exec wrangler d1 migrations list meddies --remote --config worker/wrangler.jsonc
pnpm exec wrangler d1 migrations apply meddies --remote --config worker/wrangler.jsonc
pnpm exec wrangler deploy --config worker/wrangler.jsonc --tag "$GITHUB_SHA"
pnpm exec vercel deploy --prod --yes --token "$VERCEL_TOKEN" --meta "githubCommitSha=$GITHUB_SHA" --meta githubCommitRef=main
```

Inspect the production alias to confirm it points to the returned deployment,
then run the same public GET probes against `PRODUCTION_APP_URL` and the Worker
origin. Keep credentials out of shell tracing, command logs, issue comments and
artifacts. Never use `set -x` with release commands.

D1 migrations, Worker deployment and Vercel deployment are separate operations, so
migrations follow the [schema change rules](architecture.md#persistence-rules). Never roll
an old Worker over a schema it cannot read; repair forward with a reviewed additive
migration or a compatible Worker/app version.
