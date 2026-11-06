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

## API responsibilities

- Routes adapt HTTP to feature operations. Import shared HTTP policy and feature
  server entry points; do not validate domain fields, import database code or call
  storage transport from routes. Keep Auth.js as its dedicated protocol handler
  and preserve the session endpoint's human-readable errors.
- `src/lib/http.ts` owns mutation origin/content-type guards, no-store JSON and
  failure mapping. `src/lib/json-request.ts` owns the shared 4096-byte streamed
  JSON limit, used by both Next.js and the Worker.
- Feature operations authenticate before protected work, including server-page
  calls, and derive owner IDs from the signed session. Preserve schedules PUT
  compatibility: reject invalid outcome/Skipped fields before authentication, then
  authenticate before parsing occurrence and intake details. Contracts own domain parsing and
  command/response types, including legacy compatibility. Keep contracts and
  `application-error.ts` runtime-neutral: no Next.js, Node, server-only, environment
  access or persistence imports.
- Feature `server.ts` modules own server-only dependency wiring and Worker response
  decoding. `medicine-storage.ts` owns the private capability, URL configuration,
  timeout, redirect policy and network/status mapping; it does not decode domain
  envelopes. Browser components must not import server modules or transport.
- Worker entry points enforce the service capability and owner-scoped persistence.
  Prefer direct feature calls; avoid configurable handler pipelines and generic
  command/repository frameworks.

## Worker responsibilities

- `worker/index.ts` owns HTTP lifecycle, D1/clock wiring and explicit dispatch.
  `http.ts` owns service capability authentication, route guards, bounded JSON,
  no-store responses and failure mapping. `commands.ts` decodes unknown input into
  shared typed commands after capability/route checks, preserving owner-first
  validation, defaults and legacy optional dates.
- `worker/medicines.ts` and `schedules.ts` own feature persistence and snapshot
  composition. `worker/doses/mutations.ts` keeps atomic writes and retry
  reconciliation together; `queries.ts` owns Taken-only originals and latest
  outcomes; `occurrence.ts` loads owner-scoped context and applies neutral rules.
  SQL stays beside its behavior. Map selected rows to wire fields explicitly;
  snapshot null metadata and omitted mutation fields are compatibility contracts.
- Worker modules may import runtime-neutral contracts, scheduling rules and errors.
  ESLint prohibits app server wiring, browser components/policy, Next.js and Node
  imports. HTTP/command modules cannot import persistence. Keep direct feature
  calls rather than generic repositories or configurable command pipelines.
