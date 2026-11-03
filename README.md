# Meddies

Production Next.js App Router scaffold. Product requirements remain in
[FE-539](https://linear.app/karacadev/issue/FE-539/meddies-private-mvp-product-and-engineering-specification)
and the [Meddies documentation index](https://linear.app/karacadev/document/meddies-00-agent-guide-and-documentation-index-b487477f52de).

## Local development

Use Node **22.22.0** (`.node-version` / `.nvmrc`) and pnpm **11.2.2**
(`packageManager` in `package.json`). With fnm installed:

```sh
fnm install
fnm use
npm install --global pnpm@11.2.2
pnpm install --frozen-lockfile
pnpm dev
```

Open [localhost:3000](http://localhost:3000). The root route is the private sign-in entry.

```sh
pnpm typecheck
pnpm build
pnpm start
```

`typecheck` generates Next route types before checking production TypeScript.
`build` creates the production `.next` output and checks types; `start` serves that build.
`pnpm test` runs the HTTP authentication suite against a production build using
Node's test runner and synthetic configuration. Run `pnpm build` first.
It never signs into a real Google account or accesses production personal data.

FE-606 specifies pnpm but its clean-install acceptance line says `npm ci`.
The reproducible equivalent here is `pnpm install --frozen-lockfile`;
the root has one pnpm lockfile. Experiment manifests and npm locks remain independent.

## Source and configuration

- `src/app`: routes, root layout and metadata.
- `src/components`: shared components when first needed.
- `src/lib`: shared utilities and server integrations when first needed.
- `src/features/<feature>`: add with the first real feature, not in advance.
- `@/*`: resolves to `src/*`.
- `experiments/`: isolated feasibility evidence, outside root app checks and dependencies.

Copy `.env.example` to ignored `.env.local` and supply private values to enable sign-in.
Missing configuration disables authentication and returns HTTP 503 from auth routes.
`PORT` is an optional Next server setting, for example `PORT=3001 pnpm start`.
Future feature tickets must document their variable names with placeholder values;
store local values in ignored `.env.local`. Never expose secrets with `NEXT_PUBLIC_`.

## Private Google authentication

Use the Google Web OAuth client validated in
[FE-541](https://linear.app/karacadev/issue/FE-541/prove-private-google-sign-in-on-the-chosen-runtime).
The app uses the validated Auth.js `5.0.0-beta.32` integration on the Node runtime.
Register each exact callback URL: `http://localhost:3000/api/auth/callback/google`
for local development and `https://YOUR-APP.vercel.app/api/auth/callback/google`
for Vercel. Do not use the isolated spike callback for this application.

Set these private server variables locally and in the intended Vercel environment:

- `AUTH_URL`: canonical application origin, HTTPS in deployment.
- `AUTH_SECRET`: independently generated strong secret, at least 32 random bytes.
- `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`: Google OAuth client credentials.
- `AUTH_ALLOWED_EMAIL`: the single approved Google account, never committed.
- `AUTH_SESSION_VERSION`: optional deployment revocation version (default `1`).

Only Google identities with a verified, allowlisted email can enter. The stable
`google:<subject>` identity scopes ownership; the email is never a resource ID.
Signed encrypted session cookies have a seven-day absolute lifetime. Reading a
session does not extend that deadline. Each read rechecks the current allowlist and
session version. Change the allowlist/version or rotate the secret and redeploy
to invalidate existing sessions. Sign-out clears this browser's cookie; it does
not revoke copied cookies on other devices or sign out of Google.

`src/features/auth/server.ts` is server-only. `requireUser()` authenticates each
operation; pass an existing resource's server-read owner ID to reject a mismatch,
and scope database reads/writes to the returned ID. Never trust a client-provided
owner ID or rely on page visibility for authorization. No medication operations
or database records are introduced by this authentication slice.

`GET /api/session` exposes only the authenticated ID and absolute expiry, with
`no-store`; unauthenticated requests return 401. Auth endpoints retain Auth.js CSRF,
state and PKCE protections. Provider profiles, tokens and error causes are not logged.
The app hides authenticated content at expiry and checks sessions when focus returns.
Network loss does not imply sign-out; server operations always check independently.

After private Vercel configuration, verify approved and rejected Google accounts,
reload persistence, expired-session recovery and sign-out in that deployment.
Synthetic HTTP tests do not prove a successful Google callback. Verification
results and unresolved integration requirements belong in FE-551 on Linear.

## Vercel settings

Record these settings for the future production project; this ticket creates or changes no hosting resources:

| Setting           | Value                                                 |
| ----------------- | ----------------------------------------------------- |
| Framework preset  | Next.js                                               |
| Root directory    | Repository root (`.`), not an experiment              |
| Node.js version   | 22.x (Vercel manages the patch; local pin is 22.22.0) |
| Build environment | `ENABLE_EXPERIMENTAL_COREPACK=1`                      |
| Install command   | `pnpm install --frozen-lockfile`                      |
| Build command     | `pnpm build`                                          |
| Output directory  | Next.js default `.next`; leave override unset         |

With Corepack enabled, Vercel selects the exact pnpm version from `packageManager`
([Vercel guidance](https://vercel.com/docs/builds/configure-a-build#corepack)). Local production serving
uses `pnpm start`; Vercel uses its Next.js integration.
