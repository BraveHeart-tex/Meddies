# Development conventions

## Source layout

- `src/app`: routes, root layout and metadata.
- `src/components`: shared components when first needed.
- `src/lib`: shared utilities and server integrations when first needed.
- `src/features/<feature>`: add with the first real feature, not in advance.
- `@/*`: resolves to `src/*`.
- `experiments/`: isolated feasibility evidence, outside root app checks and dependencies.

## Environment configuration

Copy `.env.example` to ignored `.env.local` and supply private values to enable sign-in.
Missing configuration disables authentication and returns HTTP 503 from auth routes.
`PORT` is an optional Next server setting, for example `PORT=3001 pnpm start`.
Future feature tickets must document their variable names with placeholder values;
store local values in ignored `.env.local`. Never expose secrets with `NEXT_PUBLIC_`.

## Package manager

Use `pnpm install --frozen-lockfile` for reproducible installs. The root has one
pnpm lockfile. Experiment manifests and npm locks remain independent.

## Medicine storage

The application uses the FE-542 validated path: Next.js on Vercel calls a narrow
HTTPS Worker; Drizzle runs inside that Worker with its D1 binding. Cloudflare
management credentials stay on the maintainer machine. The browser receives
neither the Worker capability nor database credentials.

Private Next.js variables (also listed in `.env.example`):

- `MEDICINES_WORKER_URL`: deployed Worker origin, HTTPS outside local development.
- `MEDICINES_WORKER_SECRET`: independent random capability, at least 32 characters,
  configured with the same value as the Worker's secret binding.

`worker/wrangler.jsonc` binds the production `meddies` D1 database to the
`meddies-data` Worker. Apply `worker/migrations` with Wrangler before deploying
schema changes. Configure `MEDICINES_WORKER_SECRET` through `wrangler secret put`
and set the matching private secret and Worker origin in Vercel production.
Redeploy Vercel after changing its environment variables. Do not reuse the
synthetic feasibility database or its credentials.

Local development uses a local D1 database:

```sh
pnpm exec wrangler d1 migrations apply DB --local --config worker/wrangler.jsonc
pnpm exec wrangler dev --config worker/wrangler.jsonc
```

Put the Worker secret in ignored `worker/.dev.vars`, and the matching secret and
local Worker URL in ignored `.env.local`. Missing database configuration produces
an explicit unavailable state. Saves require a server response; setup is not
queued offline.

Manual medicine operations live in `src/features/medicines/operations.ts`.
Every invocation authenticates through `requireUser`; owner IDs sent to the Worker
come from the signed session. The Worker accepts only list/save commands, uses
bound Drizzle queries and scopes every operation by owner. Save IDs are immutable
and unique per owner: identical retries return the saved medicine; changed payloads
return conflict. The shared capability authenticates the Next.js service, which
is responsible for authenticating the end user. The Worker has no public browser
API or arbitrary SQL endpoint.
