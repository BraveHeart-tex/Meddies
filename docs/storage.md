# Medicine storage

## Service contracts

Next.js on Vercel calls a narrow HTTPS Worker; Drizzle runs inside that Worker
with its D1 binding. Cloudflare management credentials stay in the protected release environment
or on the maintainer machine. The browser receives neither the Worker capability nor database credentials.

Manual medicine operations live in `src/features/medicines/operations.ts`.
Every invocation authenticates through `requireUser`; owner IDs sent to the Worker
come from the signed session. The Worker accepts only list/save commands, uses
bound Drizzle queries and scopes every operation by owner. Save IDs are immutable
and unique per owner: identical retries return the saved medicine; changed payloads
return conflict. The shared capability authenticates the Next.js service, which
is responsible for authenticating the end user. The Worker has no public browser
API or arbitrary SQL endpoint.

Missing database configuration produces an explicit unavailable state. Saves
require a server response; setup is not queued offline.

## Local setup

Use the variable names and placeholders in `.env.example`. Put the Worker secret
in ignored `worker/.dev.vars`, and the matching secret and local Worker URL in
ignored `.env.local`. Generate an independent secret of at least 32 characters.

Apply local migrations, then start the Worker:

```sh
pnpm exec wrangler d1 migrations apply DB --local --config worker/wrangler.jsonc
pnpm exec wrangler dev --config worker/wrangler.jsonc
```

## Deployment

Use the production database binding in `worker/wrangler.jsonc`. Apply
`worker/migrations` with Wrangler before deploying schema changes. Keep synthetic
feasibility databases separate from production. Production releases use the
[ordered GitHub Actions workflow](deployment.md#ordered-releases): checks, pending
remote migrations, Worker, Vercel, then public smoke. The root release command uses
the pinned Wrangler version and the `meddies` database binding. Applied migrations
are tracked in D1 and skipped on rerun; no pending migrations is a successful no-op.
Use additive changes compatible with both currently deployed and new code. Never
reverse applied schema automatically; follow the documented recovery path after a
partial release. Keep manual Wrangler commands for coordinated recovery only.

Configure `MEDICINES_WORKER_SECRET` through `wrangler secret put` and set the
matching private secret and Worker origin in Vercel. Use HTTPS for the Worker
origin outside local development. Redeploy Vercel after changing its environment
variables.

## Daily schedules

Daily setup uses `src/features/schedules/operations.ts` and the same private
Worker capability at `/schedules`. Apply migration `0002_daily_schedules.sql`
before deploying the updated Worker and app. Existing medicines stay unscheduled.
No additional environment variables are required.

An initial schedule is immutable, owner scoped and unique per medicine. Identical
client action retries return the original confirmation instant; changed payloads
or a second initial schedule return conflict. Start dates use Europe/Istanbul and
must be today or later on first save. Only times strictly after server confirmation
produce occurrences. A retry retains that cutoff even across midnight.

Today projects a bounded date window from persisted schedules. Occurrence identity
is the immutable schedule UUID plus its UTC due instant, so reloads and device
travel do not change it. Daily clock conversion uses Istanbul's UTC+03:00 rules;
client device timezone is never used. Future schedule-edit work must retain old
versions and occurrence identities.

## Scheduled intake

Today records explicit Taken and Skipped confirmations through `PUT /api/schedules`.
Apply pending migrations through `0004_skipped_dose_records.sql`, then deploy the
Worker, then the Vercel app. The Worker validates the occurrence against the
owner's schedule. Taken stores the actual intake time and quantity. Skipped stores
the confirmation time. The owner, schedule version and due instant identify one
outcome. Identical retries return the stored outcome, and conflicting submissions
return HTTP 409. Today reads the outcomes for its Istanbul date and excludes both
confirmed outcomes from the next-dose calculation.
