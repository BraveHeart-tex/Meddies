# Vercel deployment

Use these settings when configuring the production project:

| Setting           | Value                                         |
| ----------------- | --------------------------------------------- |
| Framework preset  | Next.js                                       |
| Root directory    | Repository root (`.`), not an experiment      |
| Node.js version   | 22.x (Vercel manages the patch)               |
| Build environment | `ENABLE_EXPERIMENTAL_COREPACK=1`              |
| Install command   | `pnpm install --frozen-lockfile`              |
| Build command     | `pnpm build`                                  |
| Output directory  | Next.js default `.next`; leave override unset |

With Corepack enabled, Vercel selects the exact pnpm version from `packageManager`
([Vercel guidance](https://vercel.com/docs/builds/configure-a-build#corepack)). Local production serving
uses `pnpm start`; Vercel uses its Next.js integration.

Use `.node-version` for the local Node version.

Configure private authentication variables and callbacks using [Authentication](authentication.md).

## Worker and database

The production D1 binding is `meddies` in `worker/wrangler.jsonc`. Set
`MEDICINES_WORKER_SECRET` with `wrangler secret put`, and the matching secret and HTTPS
Worker origin as Vercel Production variables; redeploy Vercel after changing them.
Cloudflare management credentials stay in the protected release environment or on the
maintainer machine. Keep synthetic feasibility databases separate from production.
Releases apply `worker/migrations` before deploying the Worker (below); manual Wrangler
commands are for coordinated recovery only.

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

`.github/workflows/release.yml` runs on `main` pushes or manual dispatch on `main`.
Pushes changing only `docs/**`, `**/*.md` or `.agents/skills/meddies-design/**`
start no Release run. The design skill is a reference export: no application or Worker
imports it; TypeScript and Vitest input lists exclude it, production CSS explicitly
excludes it from Tailwind scanning, and ESLint and Prettier explicitly ignore it. Other `.agents` scripts
remain CI inputs. Tests pin the workflow patterns and prove release-guard parity.
Manual dispatch on main still runs, including for a non-runtime-only commit.
It calls the single Verify job for the event SHA, then enters the `production` environment.
Before dependency setup, Verify checks current main using the release guard's non-runtime-only
rule. A SHA superseded by any runtime commit succeeds early without journeys, and its
release job is skipped. Head and non-runtime-only advances proceed; lookup or history errors fail
closed. The release job directly requires Verify success and its eligible output.
A newer push cancels an in-progress Verify, and the newer Verify starts without waiting.
A separate non-canceling concurrency group on the release job covers every mutation:

1. Before any mutation, require the release SHA to be an ancestor of current main.
   Allow newer main commits only when every intervening commit changes solely `docs/`
   files, `*.md` files or `.agents/skills/meddies-design/` files. Any runtime change
   (even if later reverted), missing history or comparison failure rejects the release.
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

### Maintainer runbook: initial setup

One-time setup by an authorized maintainer. As inspected on 2026-11-03, GitHub `BraveHeart-tex/Meddies` defaults to `main`;
Vercel project `meddies` is linked to that repository with production branch `main`
and no deploy hooks. Auth and Worker capability variables are Production-only.
Vercel authentication protects generated deployment URLs (`all_except_custom_domains`);
the public custom production domain is `meddies.borakaraca.dev`.
`vercel.json` sets `git.deploymentEnabled.main` to `false`, preserving other branches'
Git previews while disabling independent Git production deployments. This does not
restrict administrators, other API clients, old revisions or dashboard redeploys.

Before enabling the first release, an authorized maintainer must:

- Verify Vercel honors the main rule on the first merged commit; cancel any older
  queued independent deployments before beginning the ordered release. Confirm
  previews lack production auth/Worker variables. Keep them unavailable, or give
  them separate synthetic credentials and isolated Worker/D1 resources. Do not
  copy production variables into Preview. Set Corepack for Preview if needed.
- Create a GitHub `production` environment, restrict deployment branches to main,
  and add required reviewers if available. Reviewers must verify the setup and SHA.
- Add environment secrets `CLOUDFLARE_API_TOKEN` (Workers Scripts Edit and D1 Edit,
  scoped to the intended account/resources), `CLOUDFLARE_ACCOUNT_ID`, and
  `VERCEL_TOKEN` (smallest available scope granting deployment to this project).
  Scope tokens as narrowly as each provider permits and rotate them separately.
- Add environment variables `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`, and
  `MEDICINES_WORKER_URL` (the production HTTPS Worker origin), and
  `PRODUCTION_APP_URL` (the public custom production origin, currently
  `https://meddies.borakaraca.dev`). Keep deployment protection enabled; no
  bypass token is needed. Both origins must be HTTPS without a trailing slash.
- Configure the matching Worker secret and Vercel Production variables using
  [Worker and database](#worker-and-database) and [Authentication](authentication.md).
  The Actions job does not need the medicine capability or Google secrets.
- Set environment variable `RELEASE_SETUP_CONFIRMED=true` only after the above
  checks. The release command fails before migrations while this gate is absent.
- Verify branch protection, environment access and reviewer settings in GitHub.
  Restrict production tokens to the environment, never repository-wide PR secrets.

Account settings and the first live Actions release require implementation-session
authorization. Until inspected after setup and a live release, remote enforcement
and deployment verification remain incomplete. See #72 for current evidence.

The Git rule follows [Vercel Git configuration](https://vercel.com/docs/project-configuration/git-configuration).
CLI deployments follow [Vercel deploy](https://vercel.com/docs/cli/deploy).

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
so do not start them. Non-runtime-only advances remain eligible under the guard above.
Dispatch Release on main to recover a skipped run.

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

D1 migrations, Worker deployment and Vercel deployment are separate operations.
Use additive, backward-compatible migrations: old app/new Worker and old Worker/new
schema must coexist during release and recovery. Never edit an applied migration.
Do not automatically reverse schema changes or roll an old Worker over a schema
it cannot read. Repair forward with a reviewed additive migration or a compatible
Worker/app version. Destructive changes need a separately planned expand/contract
rollout and backup/recovery review.
