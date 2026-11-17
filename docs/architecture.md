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
- **Medicine types and quantities** have one runtime-neutral policy shared by browser forms,
  contracts and Worker validation. It defines supported types, their Quantity units, labels,
  numeric increments and safe bounds, defaults, stepping and quantity wording. Forms retain
  text conversion and error presentation; UI modules retain decorative rendering. Unknown
  types reject rather than inheriting another type's rules. A new type adds an explicit
  policy definition together with its first complete user path, any compatible persistence
  changes and focused evidence. Do not duplicate per-unit rules across layers.
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
  contracts, `doses/occurrence.ts` owner-scoped occurrence context. `doses/unscheduled.ts` owns
  Unscheduled dose revisions, action retries and History date reads.
  `device-registrations.ts` owns Device registration writes and reads. `due-reminders.ts`
  owns the due-reminder operation, its Original reminder claims and Delivery attempts, and
  the provider port, and `fcm.ts` implements that port with FCM HTTP v1. The `schedules.ts`,
  `doses/mutations.ts`, `due-reminders.ts` and `fcm.ts` headers state their invariants.
- SQL stays beside its behavior. Map selected rows to wire fields explicitly; snapshot
  null metadata and omitted mutation fields are compatibility contracts.
- Worker modules import only runtime-neutral contracts, scheduling rules, the Reminder link
  and errors, and HTTP and command modules stay free of persistence; ESLint enforces both.

## Persistence rules

- **Medicines:** save IDs are immutable and unique per owner. An identical retry returns
  its original receipt, even after edits; a changed payload returns conflict. Production
  reads include effective-dated strength revisions, the current revision, medication revision,
  last action ID, latest recorded Taken instant and permanent ever-had-schedule/dose facts.
  The initial strength period covers all earlier instants. `PATCH /api/medicines` accepts
  `correctDetails` with a target strength revision or `changeStrength` with a UTC instant
  explicitly named in `Europe/Istanbul`; both require an action UUID and expected medication
  revision. A Detail correction amends only its period and linked dose snapshots, retaining
  previous details for export. A Strength change adds a period without rewriting saved doses,
  rejects future instants and instants before any recorded Taken time (including changed or
  removed records), and permits equality. At equal effective instants the later revision wins
  for new doses. The database validates, applies and stores the exact retry receipt atomically.
  Type/Quantity unit lock permanently on first schedule or dose use. First-use writes compare
  the unit validated by the shared quantity policy in their insertion statement.
  `PATCH /api/medicines` also accepts `archive` and `restore`, each with an action UUID
  and expected medication revision. Archive appends a stop version when needed and sets
  `archivedAt`; restore clears `archivedAt` without changing any Schedule version or replaying
  reminders. Each stores its exact retry receipt with revision + 1 and `lastActionId` in the
  same atomic write. Only an explicit schedule change can expect doses after restore.
  Schedule reads mark an archive's stop version `archiveStop: true`; while it is a restored
  Medicine's current version, screens read "No schedule" and Set schedule changes from it.
  `PATCH /api/medicines` accepts `delete` with an action UUID and expected medication
  revision only while both permanent usage facts are false. One receipt insert deletes
  the Medicine, strength revisions and record edit/archive/restore data atomically.
  Owner-scoped deletion receipts outlive the record and block creation replay, including
  inserts from an older Worker. The response contains a `deletion` receipt with the action,
  Medicine, expected revision and server-confirmed `deletedAt`; refused attempts write nothing.
- **Dose strength:** scheduled doses resolve by Taken time, or due time for Skipped;
  Unscheduled doses resolve by Taken time. Database insertion triggers save period identity,
  strength, label and Quantity unit, including writes from an older Worker during rollout.
  A time/outcome change resolves again; keeping the same time and outcome preserves the saved
  period, including explicit Detail corrections and a Strength change at the same instant.
  Original strength snapshots and the Detail correction ledger retain earlier values for export.
- **Schedules:** Schedule versions are immutable and owner-scoped, with the same retry and
  conflict behavior. A medicine has one initial version; every edit, Last day change or
  stop, pause or resume appends one successor to the version it names, atomically, at the Worker-derived
  Edit time, and earlier versions keep their doses and outcomes. First-save start dates are
  today or later in Istanbul. Only times strictly after server confirmation produce
  occurrences, and a retry keeps that cutoff across midnight. Snapshots list current
  schedules separately from `earlierSchedules`; the Query cache combines both for Today and
  filters earlier versions from medication lists. Paused versions keep the routine, start
  date and Last day but expect no doses. `pausedAt`
  keeps the immutable Edit time; `pausedOn` derives the pause day and returns null once the
  schedule is Ended. Resume keeps the routine and Last day, clears the pause, and requires a new
  Anchor for Interval schedules. Nullable `anchorDate` separates a resumed Interval Anchor from
  its preserved start date; versions without it count from `startDate`. Request rules: the `contract.ts` parsers
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
- **Unscheduled doses:** `POST /api/schedules/unscheduled` saves Taken intake with an
  action UUID, medication, intake instant and quantity. `PATCH` names the dose, action UUID
  and expected revision; `removed: false` changes intake and quantity, `removed: true`
  appends a removal. Immutable owner-scoped revisions retain exact retry receipts, even
  after later changes or removal. Intake validation uses the Worker clock and medication
  unit. Today and History responses include a separate `unscheduledDoses` array for the
  intake's Istanbul History date; Occurrences and next-dose calculations stay unchanged.
- **Device registrations:** `/api/device-registration` reads with `GET ?installationId=`
  and saves (`PUT`), renews (`PATCH`) and removes (`DELETE`) with a JSON body. The Firebase
  installation ID is the row key: save upserts it and moves it to the caller, renew updates
  only the caller's row, remove is idempotent. Every response is `{ registered }`; the
  token is stored for the sender and never returned or logged. The browser gets both from
  Firebase in `device-registrations/notification-device.ts`, loaded on first use, and
  `public/sw.js` displays incoming messages. `device-registrations/registration-upkeep.tsx`
  renews or removes a remembered registration once per signed-in launch and on Sign out.
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
