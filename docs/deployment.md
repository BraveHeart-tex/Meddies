# Vercel deployment

Use these settings when configuring the production project:

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

Configure private authentication variables and callbacks using [Authentication](authentication.md).
