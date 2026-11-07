# Architecture

Next.js on Vercel calls a narrow private HTTPS Worker; Drizzle runs inside that Worker
against its D1 binding. Each layer below has one owner. Prefer direct feature calls over
configurable handler pipelines and generic command or repository frameworks.

## Source layout

- `src/app`: routes, root layout and metadata.
- `src/components`, `src/lib`: shared components, utilities and server integrations, added
  when first needed.
- `src/features/<feature>`: added with the first real feature.
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
  contracts, `doses/occurrence.ts` owner-scoped occurrence context. Each module's header
  states its invariants.
- SQL stays beside its behavior. Map selected rows to wire fields explicitly; snapshot
  null metadata and omitted mutation fields are compatibility contracts.
- Worker modules import only runtime-neutral contracts, scheduling rules and errors, and
  HTTP and command modules stay free of persistence; ESLint enforces both.

## Persistence rules

- **Medicines:** save IDs are immutable and unique per owner. An identical retry returns
  the saved medicine; a changed payload returns conflict.
- **Schedules:** an initial schedule is immutable, owner-scoped and unique per medicine,
  with the same retry and conflict behavior. Start dates use Europe/Istanbul and must be
  today or later on first save. Only times strictly after server confirmation produce
  occurrences, and a retry keeps that cutoff across midnight. Schedule-edit work keeps old
  versions and their occurrence identities.
- **Occurrences:** identity is the immutable schedule UUID plus its UTC due instant, so
  reloads and device travel leave it unchanged. Clock conversion uses Istanbul's UTC+03:00
  rules, never the device timezone.
- **Outcomes:** `PUT /api/schedules` records Taken (actual intake time and quantity) or
  Skipped (confirmation time). Owner, schedule version and due instant identify one
  outcome; identical retries return it and conflicting submissions return 409.
  `PATCH /api/schedules` appends a correction revision, guarded by expected revision and
  outcome, idempotent by action UUID. Originals stay intact; Today and History project the
  latest revision.

Client retry and action-ID rules: [client state](client-state.md#saves).
