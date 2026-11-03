# FE-541 - Google authentication runtime spike

Experiment: 2026-11-03. **INCOMPLETE - Google integration has not been configured.** User confirmed no Google setup exists. Do not unblock FE-551 or select a production integration on this evidence.

## Environment and evidence

- Source commit: `dd351f5` on current branch `main`; baseline `0e82434`. FE-540's completed experiment is in another worktree, not integrated into main. This experiment is independent under `experiments/fe-541`.
- Alias: https://meddies-fe-541-spike.vercel.app
- Immutable deployment: https://meddies-fe-541-spike-k46063y40-bravehearttexs-projects.vercel.app
- Vercel project: `meddies-fe-541-spike`, existing `bravehearttexs-projects` Hobby scope. CLI 65.10.0, cloud build CLI 65.4.0. No purchase, DNS change, database or downstream feature.
- Next.js 16.4.4, React 19.2.0, Auth.js `next-auth` 5.0.0-beta.32, strict TypeScript. Node 22.x engine, nodejs routes, configured fra1 and maxDuration 10 seconds; local Node 22.22.0. Exact deployed Node patch not measured here. Vercel build region iad1 is distinct from configured function region.
- npm registry peer metadata explicitly includes Next 16 and React 19. Auth.js remains beta. Compilation and HTTP runtime compatibility pass; actual Google exchange remains unproven.
- Vercel build: 20 seconds; Next compile 6.3 seconds, TypeScript 3.2 seconds. Deployment ready at 11:45:30 UTC (14:45:30 Europe/Istanbul).
- Production alias publicly returned 401 for `/api/private`, `Cache-Control: no-store`, body `{"error":"Unauthorized"}`. GET and POST `/api/auth/signin` returned 503/no-store with generic missing-configuration response. No credentials were installed.
- CLI auto-connected GitHub during project creation; disconnected immediately with `vercel git disconnect --yes`. CLI-only deployment avoids an incorrect repository root build.

## Tests and limits

`npm run typecheck`, `npm run build`, and the full `npm test` HTTP suite passed locally. Initial HTTP tracer failed 404 vs expected 401 against FE-540, which has no private route. New implementation passes locally and on Vercel.

Local tests start a production Next server on port 3541 with a fresh random encryption secret and synthetic identities. The test creates encrypted session cookies using the library. It does **not** simulate or prove Google authentication. It exercises:

- Anonymous/private access, no-store; repeated requests preserve synthetic stable user ID.
- Non-allowlisted email claims, elapsed absolute deadline, missing identity and corrupt cookies rejected.
- Session endpoint omits email/name/provider tokens.
- POST sign-out without CSRF cannot clear session; valid CSRF sign-out expires cookie, subsequent anonymous request rejected.
- Invalid callback without matching state/PKCE produces error redirect and no authenticated session.

The two-minute absolute deadline prevents session-endpoint renewal from extending this experiment. It is a test value, not an agreed production session policy. Expired-claim rejection was tested without waiting two minutes. Actual deployed expiry, reload/browser restart, Secure/HttpOnly/SameSite cookies, sign-out and Google allow/deny remain untested.

Stateless sign-out deletes the current browser cookie; it does not revoke a copied token on another device. No Google access/refresh tokens are retained in the session, and sign-out does not revoke Google consent. Production account revocation/session duration and database-backed identity mapping belong to later work. No ownership-bearing medication resource exists in this spike.

Logs emit fixed `auth_failure`/`auth_warning` events only, intentionally omitting profiles, tokens, provider exception causes and emails. This trades diagnostic detail for safe spike logs; operational reporting needs later design. OAuth error pages are library defaults. Provider errors and credential mismatch need live verification.

## Private setup - required next action

1. Create/select a project in https://console.cloud.google.com/auth/overview. Configure branding and an External audience in Testing. Add approved and non-allowlisted test identities where the console requires test users. Both must be able to reach the app callback so rejection is proven by this application rather than Google's audience gate.
2. Create an OAuth client of type **Web application**. Register exactly `https://meddies-fe-541-spike.vercel.app/api/auth/callback/google` as an authorized redirect URI. Use the stable alias for this experiment; do not use random immutable deployment URLs. No custom domain change is needed. Requested scopes are only `openid email profile`.
3. Open the isolated project's Vercel Settings > Environment Variables and set these for **Production only**, server-side, without NEXT_PUBLIC prefixes:

| Variable | Private value |
| --- | --- |
| AUTH_URL | `https://meddies-fe-541-spike.vercel.app` |
| AUTH_SECRET | Independently generated cryptographically random secret of at least 32 characters; e.g. `openssl rand -base64 33` locally |
| AUTH_GOOGLE_ID | Web OAuth client ID |
| AUTH_GOOGLE_SECRET | Web OAuth client secret |
| AUTH_ALLOWED_EMAIL | Exact approved test email; one identity only |

Never paste credentials into chat, commands with literal secret arguments, issue evidence or git. Use the Vercel private UI or CLI interactive input. `.env*` and `.vercel/` are ignored; only the blank `.env.example` is tracked. AUTH_TRUST_HOST is inferred by Auth.js on Vercel; the local test sets it explicitly. AUTH_URL deliberately pins the experiment origin. A valid provider-verified email is required in addition to exact allowlist matching; Google sub supplies stable user identity.

4. Redeploy after environment changes. Changing Vercel settings does not update old immutable deployments. Keep old disabled deployment for evidence or delete after review.
5. Run the live matrix below and record pass/fail and timestamps without personal data. Do not attach HAR files or screenshots containing cookies, Google account details, codes or tokens.

## Reproduce and finish

```sh
cd experiments/fe-541
npm ci
npm run typecheck
npm run build
npm test
# Existing private Vercel CLI login required:
npm exec --yes --package=vercel@65.10.0 -- vercel link --yes --project meddies-fe-541-spike --scope bravehearttexs-projects
npm exec --yes --package=vercel@65.10.0 -- vercel deploy --yes --prod --scope bravehearttexs-projects
# Before configuring Google only:
EXPECT_UNCONFIGURED=1 PROBE_URL=https://meddies-fe-541-spike.vercel.app npm run test:deployed
# After configuring, verify anonymous boundary (not the whole live matrix):
PROBE_URL=https://meddies-fe-541-spike.vercel.app npm run test:deployed
```

| Live test | Expected result | Current result |
| --- | --- | --- |
| Approved Google account, successful callback | `/api/private` 200, stable google-prefixed user ID, no provider tokens | BLOCKED - no Google client |
| Other Google account reaches application | AccessDenied, no session, `/api/private` 401 | BLOCKED |
| Reload and browser reopen before expiry | Same ID and original expiry | BLOCKED |
| After two minutes, including repeated session checks | Private route 401, reauthentication required | BLOCKED |
| Sign out via confirmation page | Session cookie cleared; reload/private route 401 | BLOCKED |
| Callback without state/PKCE | Error, no session | PASS locally, deployed configured route untested |
| Deny Google consent | Generic error, no session | BLOCKED |
| Wrong client secret / callback mismatch | Generic failure, no session or secret disclosure | BLOCKED - use isolated test config and restore/redeploy afterward |
| Browser cookie inspection | Secure, HttpOnly, SameSite=Lax; never record value | BLOCKED |

## Acceptance status

| Criterion | Result |
| --- | --- |
| Approved identity allowed and other Google identity rejected | BLOCKED; synthetic session-claim checks are not Google proof |
| Deployed callbacks, persistence, expiry and sign-out | BLOCKED; local lifecycle checks pass |
| Library/runtime compatibility, config, failure behavior | PARTIAL; deployed compilation and disabled-auth failure pass, Google exchange untested |
| Focused evidence and unresolved blocker recorded | PASS for partial spike only |

Concrete next path: configure Google and finish this same Auth.js experiment. No evidence currently justifies switching providers. If a reproducible beta/runtime incompatibility appears, evaluate Better Auth with Google on the same Node/Vercel runtime and repeat the identical matrix before selection. Missing credentials are not evidence against either library. FE-541 remains incomplete; no downstream ticket started.

Cleanup after evidence review: remove this isolated Vercel project with `vercel project rm meddies-fe-541-spike --scope bravehearttexs-projects` (confirm project), remove local ignored `.vercel/` and `.next/`. Delete the isolated Google OAuth client and test-only consent project if created solely for this spike; do not delete shared projects or credentials. Cleanup was not executed.

## Primary references checked 2026-11-03

- [Auth.js Google provider](https://authjs.dev/getting-started/providers/google) - callback, configuration, verified email.
- [Auth.js deployment](https://authjs.dev/getting-started/deployment) - serverless configuration, secret generation, Vercel trusted-host inference.
- [Auth.js Next.js reference](https://authjs.dev/reference/nextjs) - beta package and callbacks.
- [Google web-server OAuth](https://developers.google.com/identity/protocols/oauth2/web-server) - client setup, exact redirect URI, authorization failures.

Topic docs 06/07 still describe older Cloudflare-first proposals. FE-541 and the archived handoff's later approved Vercel decision override those summaries, corroborated by completed FE-540 evidence. No architecture decision changed here.
