# Medicine storage

## Service contracts

Next.js on Vercel calls a narrow HTTPS Worker; Drizzle runs inside that Worker
with its D1 binding. Cloudflare management credentials stay on the maintainer
machine. The browser receives neither the Worker capability nor database credentials.

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
feasibility databases separate from production.

Configure `MEDICINES_WORKER_SECRET` through `wrangler secret put` and set the
matching private secret and Worker origin in Vercel. Use HTTPS for the Worker
origin outside local development. Redeploy Vercel after changing its environment
variables.
