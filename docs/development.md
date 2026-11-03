# Development conventions

## Source layout

- `src/app`: routes, root layout and metadata.
- `src/components`: shared components when first needed.
- `src/lib`: shared utilities and server integrations when first needed.
- `src/features/<feature>`: add with the first real feature, not in advance.
- `experiments/`: isolated feasibility evidence, outside root app checks and dependencies.

## Environment configuration

Copy `.env.example` to ignored `.env.local` and supply private values to enable sign-in.
Missing configuration disables authentication and returns HTTP 503 from auth routes.
Add new variables with placeholder values to `.env.example`; keep local values in
ignored `.env.local`. Keep secrets server-only, without `NEXT_PUBLIC_` prefixes.

## Package manager

Use `pnpm install --frozen-lockfile` for reproducible installs. The root has one
pnpm lockfile. Experiment manifests and npm locks remain independent.
