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

## Worker logs

In the Cloudflare dashboard, open **Workers & Pages > meddies-data > Observability > Logs**
to query persisted Worker events. Workers Logs are enabled at full sampling in
`worker/wrangler.jsonc`; invocation logs stay off.

- `kind: command`: `path`, `operation`, HTTP `status`, `errorCode` and `durationMs`.
  Paths come from the command allowlist (or `/due-reminders`), never the raw URL. Unknown
  paths are `null`; operations are `null` until decoded, or `run` for the scheduler command.
- `kind: scheduler`: `origin` (`cron` or `command`), `status` (`completed` or `failed`),
  `errorCode`, `submitted`, `dropped`, `retrying` and `durationMs`. Counts are `null` on
  failure because a run may have stopped after partial work.

Each command emits one event. Each scheduler run emits one event; an authenticated scheduler
command therefore emits both a command event and a scheduler event. A refused scheduler
command emits only its command event because no run starts. Durations are elapsed milliseconds;
`errorCode` is `null` on success, the ApplicationError code on a known failure, or `internal`.
The HTTP response for an unexpected failure remains `unavailable` (503).

Events exclude owner IDs, request bodies, headers, Medicine labels, Device registration
tokens, credentials, SQL, provider text and error messages. Cron failures expose only a safe
error code to the runtime. These events replace the earlier fixed failure logs.

## Push notifications

Notifications use the Firebase project's public web config, set as Vercel Preview and
Production variables and in local `.env.local`: `NEXT_PUBLIC_FIREBASE_API_KEY`,
`NEXT_PUBLIC_FIREBASE_PROJECT_ID`, `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`,
`NEXT_PUBLIC_FIREBASE_APP_ID` and `NEXT_PUBLIC_FIREBASE_VAPID_KEY`. They are inlined at build
time, so redeploy after changing them. Without all five, Settings shows notifications as not
available. `public/sw.js` is the service worker that displays incoming messages.

The Worker sends reminders through FCM HTTP v1 as the Firebase project's service account, from
three Worker secrets set with `wrangler secret put`: `FCM_PROJECT_ID`, `FCM_CLIENT_EMAIL` and
`FCM_PRIVATE_KEY`, copied from the service-account JSON key. Production uses the production
Firebase project for both the web config and these secrets. Local uses the separate Firebase
project `meddies-dev` for both: its web config in `.env.local` and its sender secrets in
`worker/.dev.vars`, where `FCM_PRIVATE_KEY` is one double-quoted line with `\n` escapes.

A Cron Trigger in `worker/wrangler.jsonc` runs the due-reminder operation every minute. The
approved external scheduler instead calls `POST /due-reminders` on the Worker origin with
`Authorization: Bearer <SCHEDULER_SECRET>`, a Worker secret of at least 32 characters that is
independent of `MEDICINES_WORKER_SECRET`; without it that command answers 503. The answer holds
only the run's `submitted`, `dropped` and `retrying` counts. Without all three FCM secrets both
paths stop before claiming any reminder.

## Reminder processing heartbeat

Use a Healthchecks.io check outside Cloudflare and Vercel with a **1 minute period** and
**15 minutes grace**. Enable the maintainer's email integration for down and recovery
notifications, with repeated down reminders disabled: one email on down, one on recovery.
Keep the ping URL private. Set it as the optional Worker secret `HEARTBEAT_URL` using
`pnpm exec wrangler secret put HEARTBEAT_URL --config worker/wrangler.jsonc`. For local
Worker runs, put it in `worker/.dev.vars`; `.env.example` inventories the secret, and Vercel
needs no copy. Creating and configuring the production check belongs to #418.

After either a cron or authenticated scheduler command completes, a **Healthy run** sends
one bare GET to that URL: no body, appended query, counts or owner data. A Healthy run has
no Delivery attempts in the last 80 minutes, at least one accepted attempt, or a rejection
that only reports the device gone (`UNREGISTERED` or `NOT_FOUND`) in that window (including
both boundaries and this run's attempts). Windows with only transient attempts or other
rejections, and thrown runs, send nothing, including no fail ping. Without the secret, no ping
is sent.
Pings use deferred Worker work, abort after 5 seconds and never alter the run's result.
A ping failure also produces no log containing the secret.

Stall drill (run against the configured check in #418):

1. Confirm at least one Healthy run reached the check and its status is up. Record its last
   ping time. Keep the maintainer's existing reminder method active during the drill.
2. Save the private ping URL securely, then remove `HEARTBEAT_URL` with
   `pnpm exec wrangler secret delete HEARTBEAT_URL --config worker/wrangler.jsonc`.
   Leave reminder processing running; this safely simulates absent heartbeats without
   interrupting submissions. Do not manually ping the check during the drill.
3. After 16 minutes without a ping (1 minute period plus 15 minutes grace), expect the
   check to turn down and send the maintainer one down email. Allow email delivery time;
   verify no repeated down email while leaving it down for another check period.
4. Restore the saved URL with the secret-put command above. On the next Healthy run,
   expect the check to turn up and send one recovery email. If it stays down, inspect
   scheduler events and recent Delivery attempts; all-transient attempts suppress pings
   until a final answer occurs or the attempts age out of the 80-minute window.

This drill proves the independent missing-ping alert and recovery path. Worker tests
separately prove suppression for failed runs and all-transient attempts; a check or email
integration not yet configured is not production alert evidence.

## Verify workflow

`.github/workflows/verify.yml` runs on pull requests and is called by Release before
production mutations, using `.node-version`, `packageManager` and a frozen install. It has
read-only repository access and no production environment or secrets. One eligibility job
checks current main before two parallel jobs start: `Vitest` builds Next.js and runs
`pnpm test` (Worker build and every Vitest project); `Journeys` runs lint, format check,
typecheck, production build, Worker build and every non-`@visual` journey. Both must pass
before Release can mutate production. `scripts/verify.mjs` remains the local and
manual-recovery path. The Journeys production build sets `CI_SKIP_BUILD_TYPECHECK=1`
after the explicit typecheck;
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
manual dispatch on `main`, which always runs. It calls Verify for the event SHA, then
enters the `production` environment. Before dependency setup, Verify checks current main:
a SHA superseded by any runtime commit succeeds early without Vitest or journeys, and its
release job is skipped. Head and non-runtime-only advances proceed; lookup or history
errors fail closed. The release job directly requires Verify success (both parallel jobs)
and its eligible output.
A newer push cancels an in-progress Verify, and the newer Verify starts without waiting.
A separate non-canceling concurrency group on the release job covers every mutation:

1. Before any mutation, require the release SHA to be an ancestor of current main.
   Allow newer main commits only when every intervening commit is non-runtime-only. Any
   runtime change (even if later reverted), missing history or comparison failure rejects
   the release.
2. Read the current D1 Time Travel bookmark and record it with the release SHA in the
   log and Actions summary. A read or validation failure stops before migrations.
3. Apply pending remote D1 migrations with Wrangler's migration ledger.
4. Deploy that SHA's Worker, tagged with the SHA.
5. Deploy that checkout to Vercel Production with `githubCommitSha` metadata.
6. Inspect the public production alias and require it to point to the ready
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
- **Release job failed:** the log names the stage (`preflight`, `bookmark`, `migrations`, `worker`,
  `app` or `smoke`); read what that stage leaves in production under Failure and recovery.

Agents diagnose, fix code failures with a new commit and report a failed release stage in
the active issue. Re-runs, dispatches and manual recovery are the maintainer's.

### Failure and recovery

Verify failing prevents the release job from starting. A missing setup variable or
credential stops preflight. Bookmark failure prevents migrations and deployments.
Migration failure stops Worker and app; Worker failure stops app; app or smoke failure leaves already completed stages in production.
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

For a bad migration, find the **pre-migration D1 Time Travel bookmark** for the
intended release SHA in that run's log or Actions summary. Before restoring, coordinate
with maintainers to stop production writes and reminder processing and prevent Actions
releases or manual deployments from running. A restore replaces the **whole database**,
including the migration ledger, and discards every write after that bookmark. It is not
a selective migration rollback. Review that data loss before proceeding.

[Time Travel](https://developers.cloudflare.com/d1/reference/time-travel/) retains
restore points for 7 days on Workers Free (30 days on Workers Paid). Recording a
bookmark does not extend retention or create a separate backup. Within that window,
use the same scoped Cloudflare credentials and the exact bookmark from the run:

```sh
pnpm exec wrangler d1 time-travel restore meddies --bookmark '<release-bookmark>' --config worker/wrangler.jsonc
```

Review Wrangler's confirmation before accepting the restore. Confirm the restored
schema is compatible with the deployed Worker and app; restore a compatible reviewed
version or repair forward before resuming writes, reminder processing and releases.

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
