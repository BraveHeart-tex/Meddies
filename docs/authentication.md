# Private Google authentication

## Setup

Use a Google Web OAuth client with the Node-runtime Auth.js integration. Register
these exact callback URLs for the application:

- Local: `http://localhost:3000/api/auth/callback/google`.
- Vercel: `https://YOUR-APP.vercel.app/api/auth/callback/google`.

Use `.env.example` for the private server variable inventory. Set the canonical
application origin in `AUTH_URL`, using HTTPS in deployment. Generate `AUTH_SECRET`
from at least 32 random bytes. Configure the OAuth credentials and single approved
Google account locally and in the intended Vercel environment.

## Authorization

Only Google identities with a verified, allowlisted email can enter. The stable
`google:<subject>` identity scopes ownership; the email is never a resource ID.

`src/features/auth/server.ts` is server-only. `requireUser()` authenticates each
operation; pass an existing resource's server-read owner ID to reject a mismatch,
and scope database reads/writes to the returned ID. Derive ownership from the
signed session and server-read resources. Page visibility is not an authorization
boundary.

## Sessions and revocation

Signed encrypted session cookies have a seven-day absolute lifetime. Reading a
session does not extend that deadline. Each read rechecks the current allowlist and
session version. Change the allowlist/version or rotate the secret and redeploy
to invalidate existing sessions. Sign-out clears this browser's cookie; it does
not revoke copied cookies on other devices or sign out of Google.

`GET /api/session` exposes only the authenticated ID and absolute expiry, with
`no-store`; unauthenticated requests return 401. Auth endpoints retain Auth.js CSRF,
state and PKCE protections. Provider profiles, tokens and error causes are not logged.

Session end clears all private browser state; [client state](client-state.md#session-end)
lists what it covers. Hydrated payloads carry display data only, never secrets or the
Worker capability.

## Deployment verification

After private Vercel configuration, verify approved and rejected Google accounts,
reload persistence, expired-session recovery and sign-out in that deployment.
Synthetic HTTP tests do not prove a successful Google callback. Record results
and unresolved integration requirements in the active GitHub issue.
