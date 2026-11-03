# FE-541 - Google authentication runtime spike

Experiment: 2026-11-03. **Required acceptance checks PASS - ready for review.** Automated runtime evidence and user-observed live Google account tests are distinguished below. Initial deployment failures and setup history are retained as historical evidence. No downstream ticket started.

## Environment and evidence

- Source commit: `dd351f5` on current branch `main`; baseline `0e82434`. FE-540's completed experiment is in another worktree, not integrated into main. This experiment is independent under `experiments/fe-541`.
- Alias: https://meddies-fe-541-spike.vercel.app
- Immutable deployment: https://meddies-fe-541-spike-k46063y40-bravehearttexs-projects.vercel.app
- Vercel project: `meddies-fe-541-spike`, existing `bravehearttexs-projects` Hobby scope. CLI 65.10.0, cloud build CLI 65.4.0. No purchase, DNS change, database or downstream feature.
- Next.js 16.4.4, React 19.2.0, Auth.js `next-auth` 5.0.0-beta.32, strict TypeScript. Node 22.x engine, nodejs routes, configured fra1 and maxDuration 10 seconds; local Node 22.22.0. Exact deployed Node patch not measured here. Vercel build region iad1 is distinct from configured function region.
- npm registry peer metadata explicitly includes Next 16 and React 19. Auth.js remains beta. Compilation, HTTP runtime compatibility and user-observed Google exchange pass. This establishes a viable candidate; production session/revocation policy remains separate.
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

The two-minute absolute deadline prevents session-endpoint renewal from extending this experiment. It is a test value, not an agreed production session policy. Expired-claim rejection was tested without waiting two minutes. Deployed reload/reopen persistence, expiry, sign-out and Google allow/deny subsequently passed the user-run checks. Transient cookie flags passed automated inspection; session-cookie flags were not independently inspected.

Stateless sign-out deletes the current browser cookie; it does not revoke a copied token on another device. No Google access/refresh tokens are retained in the session, and sign-out does not revoke Google consent. Production account revocation/session duration and database-backed identity mapping belong to later work. No ownership-bearing medication resource exists in this spike.

Logs emit fixed `auth_failure`/`auth_warning` events only, intentionally omitting profiles, tokens, provider exception causes and emails. This trades diagnostic detail for safe spike logs; operational reporting needs later design. OAuth error pages are library defaults. Provider errors and credential mismatch need live verification.

## Private setup - reproduction instructions (now completed)

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

## Reproduce

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
| Approved Google account, successful callback | `/api/private` 200, stable google-prefixed user ID, no provider tokens | PASS - user observed successful sign-in and userId/expires response |
| Other Google account reaches application | AccessDenied, no session, `/api/private` 401 | PASS - user observed application AccessDenied and Unauthorized |
| Reload and browser reopen before expiry | Same ID and original expiry | PASS - user reports all requested lifecycle checks passed |
| After two minutes, including repeated session checks | Private route 401, reauthentication required | PASS - user reports lifecycle checks passed |
| Sign out via confirmation page | Session cookie cleared; reload/private route 401 | PASS - user observed immediate Unauthorized; cookie deletion inferred from behavior |
| Callback without state/PKCE | Error, no session | PASS - automated locally and on configured Vercel deployment |
| Deny Google consent | Generic error, no session | NOT RUN - supplemental consent-denial case |
| Wrong client secret / callback mismatch | Generic failure, no session or secret disclosure | NOT RUN - supplemental misconfiguration case; missing configuration was tested |
| Browser cookie inspection | Secure, HttpOnly, SameSite=Lax; never record value | PASS for transient cookies via HTTP; session-cookie flags not independently inspected |

## Acceptance status

| Criterion | Result |
| --- | --- |
| Approved identity allowed and other Google identity rejected | PASS - two real Google account journeys reported by user |
| Deployed callbacks, persistence, expiry and sign-out | PASS - user performed requested deployed lifecycle checks; automated invalid callback rejection |
| Library/runtime compatibility, config, failure behavior | PASS - build/runtime, Google exchange, invalid callback, missing config and app AccessDenied evidence; supplemental failure cases remain untested |
| Focused evidence and unresolved blocker recorded | PASS - commands, deployment, automated outputs, user-observed results and limitations recorded |

Recommendation: Auth.js 5.0.0-beta.32 is a demonstrated Google authentication candidate on this Next.js/Vercel Node runtime. No evidence currently justifies switching providers. If a reproducible beta/runtime incompatibility appears, evaluate Better Auth with Google on the same Node/Vercel runtime and repeat the identical matrix before selection. No unresolved blocker remains for this narrow spike. Production session lifetime, revocation, database identity integration and resource ownership enforcement belong to later work; no downstream ticket started.

Cleanup after evidence review: remove this isolated Vercel project with `vercel project rm meddies-fe-541-spike --scope bravehearttexs-projects` (confirm project), remove local ignored `.vercel/` and `.next/`. Delete the isolated Google OAuth client and test-only consent project if created solely for this spike; do not delete shared projects or credentials. Cleanup was not executed.

## Primary references checked 2026-11-03

- [Auth.js Google provider](https://authjs.dev/getting-started/providers/google) - callback, configuration, verified email.
- [Auth.js deployment](https://authjs.dev/getting-started/deployment) - serverless configuration, secret generation, Vercel trusted-host inference.
- [Auth.js Next.js reference](https://authjs.dev/reference/nextjs) - beta package and callbacks.
- [Google web-server OAuth](https://developers.google.com/identity/protocols/oauth2/web-server) - client setup, exact redirect URI, authorization failures.

Topic docs 06/07 still describe older Cloudflare-first proposals. FE-541 and the archived handoff's later approved Vercel decision override those summaries, corroborated by completed FE-540 evidence. No architecture decision changed here.

## Review and saved outputs

[Cloud build output](build.txt) and [focused verification output](verification.txt) contain no credentials. Code-review skill used baseline `0e82434` through `a5cd30a`, with independent Standards and Spec reviewers. Standards: 0 actionable findings. Spec: 0 actionable defects; real Google allow/deny and deployed lifecycle criteria remain blocked. Final typecheck and full focused suite passed after review. No functional code changed after deployed source `dd351f5`.


## Historical configured redeployment - 2026-11-03, 14:55 Europe/Istanbul

User added the private environment variables and redeployed. New immutable deployment: https://meddies-fe-541-spike-eeoz12958-bravehearttexs-projects.vercel.app (`dpl_CKcnWhaW4JmRcC6j6XGy2zrSDdSt`). Vercel reports Ready, build duration 25 seconds, functions in fra1. No environment values were retrieved.

Reproducible check:

```sh
cd experiments/fe-541
EXPECT_CONFIGURED=1 PROBE_URL=https://meddies-fe-541-spike.vercel.app npm run test:deployed
```

PASS: anonymous private endpoint remains 401/no-store; Google provider endpoint returns 200; CSRF-protected sign-in POST redirects to accounts.google.com with the exact registered application callback, state, S256 PKCE; CSRF, state and PKCE cookies are Secure/HttpOnly/SameSite=Lax; invalid callback without matching cookies redirects to error without a session.

This supersedes the missing-configuration blocker above. It proves the authorization request can be constructed, not that the OAuth client/secret are valid or registered correctly at Google. Real approved-account callback, non-allowlisted identity rejection, browser persistence, two-minute expiry and sign-out still require interactive verification. User has been asked to complete approved sign-in and report only success or a generic error name. No real-account criterion has been marked PASS.

## Historical interactive approved-account result - 2026-11-03

User reports: "Sign-in succeeds; userId and expires shown" after following the deployed approved-account journey. Result: approved Google sign-in, successful callback and authenticated private endpoint PASS (user-observed evidence; not independently inspected by the agent). No identity or session values were collected.

This supersedes the approved-account blocker above. Non-allowlisted Google rejection and deployed persistence/expiry/sign-out remain pending. Requested reproducible lifecycle check: fresh sign-in, reload/reopen before two minutes preserving ID and expiry; reload after two minutes returns Unauthorized; fresh sign-in followed by confirmed sign-out immediately returns Unauthorized. Requested a separate private-window Google sign-in with the non-allowlisted identity reaching application AccessDenied, followed by private endpoint Unauthorized. A Google audience restriction alone does not prove the application allowlist. FE-541 stays In Progress.


## Final interactive verification - 2026-11-03

User completed the exact requested deployed tests and reported:

- "All lifecycle checks pass": fresh approved sign-in; reload/reopen before two minutes preserves user ID and expiry; reload after two minutes returns Unauthorized; new sign-in followed by confirmed sign-out immediately returns Unauthorized.
- "App shows AccessDenied; private session Unauthorized": separate private/incognito window with the non-allowlisted Google account reached application rejection. This was not merely a Google audience/test-user block.

Evidence provenance: user-observed manual checks on the configured production alias above. Agent did not inspect authenticated browser state, collect identity/cookie values or independently capture these journeys. Browser/OS version and exact per-step timestamps were not supplied; do not infer physical-iPhone/PWA evidence from these results. Automated local tests and deployed HTTP checks independently cover the corresponding synthetic and unauthenticated boundaries.

These results supersede the earlier pending/blocker statements in the historical sections. All four required FE-541 acceptance criteria now pass for the narrow feasibility outcome. Supplemental consent-denial, intentionally wrong-secret/callback configuration and independent session-cookie flag inspection were not performed. Auth.js remains beta; no production policy, daily-use readiness or database/ownership integration is established here. Leave FE-541 In Review for acceptance; no downstream work started. No source changes or redeployment are required for this evidence-only update; tested functional source remains `dd351f5`.
