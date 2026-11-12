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

Client retry and action-ID rules: [client state](client-state.md#saves).

## Automated dependency checks

`pnpm lint` runs ESLint plus `scripts/check-architecture.mjs`, a second ESLint pass
that ignores inline configuration and reports only architecture violations. Inline
`eslint-disable` or rule configuration cannot bypass this pass. `pnpm verify:local`
runs it with the type, production build and behavior checks.

`eslint-rules/architecture.mjs` owns module roles, the closed runtime-neutral surface
and the named exceptions. Import aliases and relative paths resolve to the same role;
explicit `.ts`/`.tsx` extensions do not change it. Imports, re-exports, literal dynamic
imports and CommonJS imports are checked. Computed imports are rejected in application,
neutral and Worker code because their dependency direction cannot be checked.

- Contracts, neutral rules/errors and injected operations depend only on the listed
  neutral modules. They cannot import framework, environment or persistence wiring.
- Worker modules may import Worker code, Drizzle and the listed neutral modules.
  HTTP and command decoding may import only each other and neutral modules.
- Persistence stays inside the Worker. Only medicine and schedule server wiring may
  import the private storage transport. Only server wiring and focused tests may
  import injected operation factories.
- Browser feature components and query modules cannot import server wiring or HTTP
  policy. Server wiring and prefetch composition must retain `import 'server-only'`.
  Next.js enforces that marker through arbitrarily named browser helpers and indirect
  imports; the lint policy does not duplicate Next.js's module graph.
- API routes import shared HTTP policy and authenticated feature server entry points.
  Pages and other helpers cannot import, re-export or dynamically access raw `send`
  exports from those entry points.

Named exceptions (central definitions in the rule, fixtures in
`tests/architecture-lint.test.ts`):

- `tests/gateway.test.ts` may import raw feature senders to exercise decoding and
  transport failures with synthetic authentication. Other tests use injected operations.
- `features/auth/server.ts` owns Auth.js and signed-session authentication.
- `app/api/auth/[...nextauth]/route.ts` preserves the Auth.js protocol handler.
- `app/api/session/route.ts` calls `requireUser` directly for the session probe and its
  human-readable errors.
- `features/schedules/prefetch.ts` is marked server-only and may compose authenticated
  feature operations with server-safe query options. Browser query modules remain
  importable by that composition; client hooks belong in components.

The negative compiler fixture in `tests/architecture-build.test.ts` proves indirect
browser-to-server rejection with the installed Next.js compiler. The production build
proves the legitimate application graph, including auth, session and prefetch, still
compiles. These checks enforce dependency direction; authentication behavior remains
covered at the injected operations and gateway seams.
