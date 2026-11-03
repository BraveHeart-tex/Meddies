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

Open [localhost:3000](http://localhost:3000). The root route is an English placeholder.

```sh
pnpm typecheck
pnpm build
pnpm start
```

`typecheck` generates Next route types before checking production TypeScript.
`build` creates the production `.next` output and checks types; `start` serves that build.
No test framework or root test suite is installed for this static placeholder.

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

No application environment variables or credentials are required by this scaffold.
`PORT` is an optional Next server setting, for example `PORT=3001 pnpm start`.
Future feature tickets must document their variable names with placeholder values;
store local values in ignored `.env.local`. Never expose secrets with `NEXT_PUBLIC_`.

See [engineering standards](docs/engineering-standards.md) and
[FE-606 verification](docs/fe-606/README.md).

## Vercel settings

Record these settings for the future production project; this ticket creates or changes no hosting resources:

| Setting | Value |
| --- | --- |
| Framework preset | Next.js |
| Root directory | Repository root (`.`), not an experiment |
| Node.js version | 22.x (Vercel manages the patch; local pin is 22.22.0) |
| Build environment | `ENABLE_EXPERIMENTAL_COREPACK=1` |
| Install command | `pnpm install --frozen-lockfile` |
| Build command | `pnpm build` |
| Output directory | Next.js default `.next`; leave override unset |

With Corepack enabled, Vercel selects the exact pnpm version from `packageManager`
([Vercel guidance](https://vercel.com/docs/builds/configure-a-build#corepack)). Local production serving
uses `pnpm start`; Vercel uses its Next.js integration.
