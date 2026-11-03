# Private Google authentication

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

## Deployment verification

After private Vercel configuration, verify approved and rejected Google accounts,
reload persistence, expired-session recovery and sign-out in that deployment.
Synthetic HTTP tests do not prove a successful Google callback. Verification
results and unresolved integration requirements belong in FE-551 on Linear.
