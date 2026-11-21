# Deployment setup

One-time production setup by an authorized maintainer. Releases, failure diagnosis and
recovery: [deployment](deployment.md).

## Vercel project

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

Configure private authentication variables and callbacks using [Authentication](authentication.md).

## Worker Access

The production Worker custom domain is `api.meddies.borakaraca.dev`. Use one
Worker-level Cloudflare Access application for `meddies-data`, scope **All traffic**,
with a **Service Auth** policy including only the named server callers. This protects
the Worker's custom domains, routes, `workers.dev` and previews. Check for more-specific
hostname/path Access applications, which take precedence, and remove unintended bypasses.
Do not apply an account-wide rule to unrelated Workers.

Create separate service tokens named `meddies-vercel-production` and
`meddies-github-release` in **Zero Trust > Access controls > Service credentials >
Service Tokens**. Store each pair as `WORKER_ACCESS_CLIENT_ID` and
`WORKER_ACCESS_CLIENT_SECRET`: Vercel's pair in Production-only server environment
variables, GitHub's pair in the repository's `production` environment secrets.
The workflow passes GitHub's pair to the release command. Never use `NEXT_PUBLIC_*`,
copy production tokens into Preview, or record credential values in logs or issues.

The gateway sends `CF-Access-Client-Id` and `CF-Access-Client-Secret` alongside its
existing Worker bearer. With `VERCEL_ENV=production`, missing either Access credential
rejects remote Worker calls before networking; a partial pair also rejects remote calls
outside Production. Local `localhost`/`127.0.0.1` Workers omit both Access headers,
even if credentials are inherited. `NODE_ENV=production` alone does not require Access,
so the local production-build tests keep using local workerd.

Activate in this order:

1. Create the tokens and a reusable Service Auth policy, leaving it unattached.
2. Store credentials, set both Vercel's Production and GitHub's `production`
   `MEDICINES_WORKER_URL` to `https://api.meddies.borakaraca.dev`, then release the
   caller code before attaching the policy. The app and smoke probe must succeed.
3. In **Workers & Pages > meddies-data > Access**, select **Protect this Worker behind
   Access > All traffic** and attach the Service Auth policy. Keep access limited to
   the named service tokens rather than human Allow or Bypass policies.
4. Check missing and invalid Access credentials are denied before invocation, using
   Worker HTTP invocation metrics and Access events where available. No command log
   alone does not prove no invocation. With valid Access credentials but no Worker
   bearer, require 401 and the Worker's `{ "error": "unauthorized" }` JSON. Verify
   authenticated app operations and continuing Cron events separately.
5. Once cutover works, disable `workers.dev` and preview/version URLs in Wrangler
   with `workers_dev: false` and `preview_urls: false` through an ordered release.
   Inventory and probe all actual domain, version, alias, preview and deployment URLs;
   each must be disabled or Access-protected. Dashboard-only URL disablement can be
   reversed by a later Wrangler deployment.

The direct Cron Trigger does not make an HTTP call through Access. If cron-job.org is
enabled as an external scheduler, give it a separate service token and send both Access
headers alongside its existing scheduler bearer before activating the policy. Outbound
FCM and heartbeat traffic is unaffected. Access blocks direct unauthorized HTTP traffic;
it does not limit app users whose requests Vercel forwards with valid credentials.

Track token expiration and renew before expiry. For rotation, authorize a replacement
token, update only that caller's private configuration, redeploy Vercel if applicable,
verify the caller, then revoke the old token. A failed Access token or policy can leave
the website reachable while data calls fail; inspect Access policy/token state and the
gateway's safe HTTP failure event before changing Worker bearer credentials. Correct
the affected token/policy and verify the caller again. Coordinate release recovery using
[deployment recovery](deployment.md#failure-and-recovery); do not publish credentials or
remove protection as a routine recovery step.

References: [Worker-level Access](https://developers.cloudflare.com/workers/configuration/cloudflare-access/)
and [service tokens](https://developers.cloudflare.com/cloudflare-one/access-controls/service-credentials/service-tokens/).

## Initial release setup

As inspected on 2026-11-03, GitHub `BraveHeart-tex/Meddies` defaults to `main`;
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
  [Worker and database](deployment.md#worker-and-database) and [Authentication](authentication.md).
  The Actions job does not need the medicine capability or Google secrets.
- Set environment variable `RELEASE_SETUP_CONFIRMED=true` only after the above
  checks. The release command fails before migrations while this gate is absent.
- Verify branch protection, environment access and reviewer settings in GitHub.
  Restrict production tokens to the environment, never repository-wide PR secrets.

Account settings and the first live Actions release require implementation-session
authorization. Setup evidence is in #72.

The Git rule follows [Vercel Git configuration](https://vercel.com/docs/project-configuration/git-configuration).
CLI deployments follow [Vercel deploy](https://vercel.com/docs/cli/deploy).
