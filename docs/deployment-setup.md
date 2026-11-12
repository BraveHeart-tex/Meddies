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
