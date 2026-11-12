# Architecture

Next.js on Vercel calls a narrow private HTTPS Worker; Drizzle runs inside that Worker
against its D1 binding. Each layer below has one owner. Prefer direct feature calls over
configurable handler pipelines and generic command or repository frameworks.

## Source layout

- `src/app`: routes, root layout and metadata.
- `src/components`, `src/lib`: shared components, utilities and server integrations.
- `src/features/<feature>`: one folder per feature, such as `medicines` and `schedules`.
- `worker/`: the Worker, its D1 schema and `migrations/`.
- `experiments/`: isolated feasibility evidence with its own manifests and npm locks,
  outside root app checks. The root has one pnpm lockfile.

## Environment

`.env.example` is the variable inventory: add new variables there with placeholder
values, and keep real values in ignored `.env.local` and `worker/.dev.vars`. Secrets stay
server-only, without `NEXT_PUBLIC_`. Missing auth configuration disables sign-in with
HTTP 503; missing database configuration renders an explicit unavailable state.

## Next.js layers

- **Routes** adapt HTTP to feature operations: they import shared HTTP policy and feature
  server entry points, and leave domain validation, database code and storage transport
  to the layers below. Auth.js stays its own protocol handler; the session endpoint keeps
  its human-readable errors.
- **`src/lib/http.ts`** owns mutation origin and content-type guards, no-store JSON and
  failure mapping. **`src/lib/json-request.ts`** owns the 4096-byte streamed JSON limit
  shared with the Worker.
- **Feature operations** (`src/features/*/operations.ts`) authenticate through
  `requireUser` before protected work, server pages included, and send the Worker owner
  IDs from the signed session ([authentication](authentication.md)). Schedules PUT keeps
  its compatibility order: reject invalid outcome or Skipped fields, then authenticate,
  then parse occurrence and intake details.
- **Contracts** own domain parsing and command and response types, legacy compatibility
  included. Contracts and `application-error.ts` are runtime-neutral: no Next.js, Node,
  `server-only`, environment or persistence imports.
- **Feature `server.ts`** owns server-only wiring and Worker response decoding.
  **`medicine-storage.ts`** owns the private capability, Worker URL, timeout, redirect
  policy and network and status mapping; domain envelopes are decoded in `server.ts`.
- **Browser code** is every `src/features/**/*.tsx` file and feature `queries.ts`; it
  reaches data through API routes only. Server composition (prefetch, dehydrate) lives in
  a feature `.ts` module marked `server-only`, such as `schedules/prefetch.ts`, or in
  `src/app/**`.

## Worker

The Worker trusts the shared capability as proof that Next.js authenticated the user. It
has no public browser API and no arbitrary SQL endpoint, and scopes every operation by
owner.

- `worker/index.ts` owns the HTTP lifecycle, D1 and clock wiring and explicit dispatch.
- `http.ts` owns capability authentication, route guards, bounded JSON, no-store
  responses and failure mapping. `commands.ts` decodes input into shared typed commands
  after those checks, keeping owner-first validation, defaults and legacy optional dates.
- `medicines.ts` and `schedules.ts` own feature persistence and snapshot composition.
  `doses/mutations.ts` owns writes and retry reconciliation, `doses/queries.ts` the read
  contracts, `doses/occurrence.ts` owner-scoped occurrence context. The `schedules.ts` and
  `doses/mutations.ts` headers state their invariants.
- SQL stays beside its behavior. Map selected rows to wire fields explicitly; snapshot
  null metadata and omitted mutation fields are compatibility contracts.
- Worker modules import only runtime-neutral contracts, scheduling rules and errors, and
  HTTP and command modules stay free of persistence; ESLint enforces both.

## Persistence rules

- **Medicines:** save IDs are immutable and unique per owner. An identical retry returns
  the saved medicine; a changed payload returns conflict.
- **Schedules:** Schedule versions are immutable and owner-scoped, with the same retry and
  conflict behavior. A medicine has one initial version; every edit, Last day change or
  stop appends one successor to the version it names, atomically, at the Worker-derived
  Edit time, and earlier versions keep their doses and outcomes. First-save start dates are
  today or later in Istanbul. Only times strictly after server confirmation produce
  occurrences, and a retry keeps that cutoff across midnight. Snapshots list current
  schedules separately from `earlierSchedules`; the Query cache combines both for Today and
  filters earlier versions from medication lists. Request rules: the `contract.ts` parsers
  and the `worker/schedules.ts` header.
- **Occurrences:** identity is the immutable schedule UUID plus its UTC due instant, so
  reloads and device travel leave it unchanged. Clock conversion uses Istanbul's UTC+03:00
  rules, never the device timezone.
- **Outcomes:** `PUT /api/schedules` records Taken (actual intake time and quantity) or
  Skipped (confirmation time). Owner, schedule version and due instant identify one
  outcome; identical retries return it and conflicting submissions return 409.
  `PATCH /api/schedules` appends a correction revision, guarded by expected revision and
  outcome, idempotent by action UUID. Originals stay intact; Today and History project the
  latest revision.
- **Schema changes:** write each migration by hand as the next numbered
  `worker/migrations/NNNN_<name>.sql` and mirror it in the Drizzle tables in
  `worker/schema.ts`. The local stack, tests and Release apply migrations in order. Keep
  each one additive and backward compatible, since the old app with the new Worker and the
  old Worker with the new schema coexist during release and recovery: a new column is
  nullable or has a default. Leave applied migrations unchanged and repair forward with a
  new one. A destructive change needs a separately planned expand/contract rollout and a
  backup and recovery review.

Client retry and action-ID rules: [client state](client-state.md#saves).

## Automated dependency checks

`pnpm lint` runs ESLint plus `scripts/check-architecture.mjs`, an architecture-only pass that
inline `eslint-disable` cannot bypass. `eslint-rules/architecture.mjs` owns the module roles,
the runtime-neutral surface and the named exceptions, with fixtures in
`tests/architecture-lint.test.ts`; `tests/architecture-build.test.ts` proves Next.js rejects
indirect browser-to-server imports. Each violation names the boundary it crosses: move the
code to the layer that owns it; a new named exception changes the rule and its fixtures.
