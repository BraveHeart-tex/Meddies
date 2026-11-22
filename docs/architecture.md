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
  failure mapping. **`src/lib/json-request.ts`** owns the default 4096-byte streamed JSON limit
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
  **`medicine-storage.ts`** owns the private capability, Access service-token headers, Worker URL, timeout, redirect
  policy and network and status mapping; domain envelopes are decoded in `server.ts`.
- **Browser code** is every `src/features/**/*.tsx` file and feature `queries.ts`; it
  reaches data through API routes only. Server composition (prefetch, dehydrate) lives in
  a feature `.ts` module marked `server-only`, such as `schedules/prefetch.ts`, or in
  `src/app/**`.

## Worker

The Worker trusts the shared capability as proof that Next.js authenticated the user. It
has no public browser API and no arbitrary SQL endpoint, and scopes every operation by
owner.

- `worker/index.ts` owns the HTTP lifecycle, D1 and clock wiring and explicit dispatch, and
  wires the cron trigger and the scheduler command to the due-reminder operation.
- `http.ts` owns capability authentication, route guards, bounded JSON, no-store
  responses and failure mapping. `commands.ts` decodes input into shared typed commands
  after those checks, keeping owner-first validation, defaults and legacy optional dates.
- `medicines.ts` and `schedules.ts` own feature persistence and snapshot composition.
  `doses/mutations.ts` owns writes and retry reconciliation, `doses/queries.ts` the read
  contracts, `doses/occurrence.ts` owner-scoped occurrence context. `doses/unscheduled.ts` owns
  Unscheduled dose revisions, action retries and History date reads. `doses/history.ts` owns the
  Dose history read.
  `device-registrations.ts` owns Device registration writes and reads, `quiet-hours.ts` the
  account's Quiet hours reads and sets, and `medication-names.ts` its Medication names reads and
  sets. `snoozes.ts` owns the Snooze command. `due-reminders.ts` owns the due-reminder operation,
  its Original reminder, Follow-up reminder and Snooze claims and Delivery attempts, and the
  provider port. `refill-pushes.ts` owns low-stock episode targeting and refill Delivery
  attempts. `fcm.ts` implements both provider ports with FCM HTTP v1. The scheduler leaves
  refill pushes inactive until #54 adds Quiet hours and activates the sender. The `schedules.ts`,
  `doses/mutations.ts`, `snoozes.ts`, `due-reminders.ts`, `refill-pushes.ts` and `fcm.ts`
  headers state their invariants.
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
  revision. Name and Strength corrections amend their period and linked dose snapshots, retaining
  previous details for export. A Strength change adds a period without rewriting saved doses,
  rejects future instants and instants before any recorded Taken time (including changed or
  removed records), and permits equality. At equal effective instants the later revision wins
  for new doses. The database validates, applies and stores the exact retry receipt atomically.
  `POST /api/medicines/type-correction` reviews the requested Type against all Schedule versions
  and current Taken amounts. `PATCH` on the same route submits the Medicine revision and
  review version, the explicit repairs, a fresh Stock count if tracked and any Name or Strength
  changes for the selected period. The correction route accepts a bounded 128 KiB repair payload.
  The Medicine revision protects Medicine and Stock edits. The review version also advances
  with Schedule version and dose writes. The insertion statement compares both versions.
  The correction updates Type across Strength periods, stores amended Schedule amounts with
  original retry values, and overlays repaired quantities on exact dose revisions for reads.
  The receipt and earlier details and amounts are retained. Other writers still validate
  against the current Type at insertion, including an older Worker on the migrated schema.
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
- **Stock:** `PATCH /api/medicines` accepts `stockOn`, `stockOff`, `stockCorrection`, `stockRefill` and `stockThreshold` with an
  action UUID and expected Medicine revision. `stockOn` supplies the Medicine type and
  `startingCount`; `stockCorrection` supplies the Medicine type and `count`. The atomic
  write compares that type against the owned active Medicine. A correction requires tracking
  to be on and atomically replaces the count and reconciliation point, recording a
  `countCorrection` movement even when the count is unchanged. It does not rewrite intake.
  A refill supplies the Medicine type and positive `amount`, requires tracking on, and
  atomically adds to the count with a `refill` movement retaining the amount and Quantity unit.
  Only when the stored count is below zero does it replace the count with the amount and
  reset `stock_started_at` to server time. Otherwise it preserves the reconciliation point,
  including at exactly zero. It never rewrites doses or intake movements. The resulting count
  must stay within the Quantity unit's safe bound; a refusal writes nothing.
  `stockThreshold` supplies the Medicine type and a positive `threshold`, or explicit `null`
  to turn the alert off. It requires tracking on, compares the Medicine type and saves the
  threshold and receipt without changing the count, reconciliation point or movements.
  Thresholds use the Quantity unit's step and safe bound. Reads include `stock.threshold`
  when configured and `stock.low: true` only for an active, tracked Medicine whose raw
  stored count is below it, including below zero. Equality is sufficient. The low flag is
  derived, never stored. Tracking off keeps the threshold; tracking on evaluates the fresh
  count against it. A Type change clears the threshold in the same write, including from an
  older Worker. A tracked Type correction requires a fresh count and creates a
  `countCorrection` movement in the corrected unit at the new reconciliation point.
  Prior Stock movements and their units are retained. Untracked Stock stays off.
  Archive keeps the threshold without marking Stock low.
  Stock uses the shared quantity grid and safe bound with zero allowed. Starting counts
  are reconciliation movements with their server time and Quantity unit, retained when
  tracking turns off. Stock locks the Type while on; archive preserves it read-only.
  Add medicine accepts an optional `startingCount`; the Medicine, movement and immutable
  creation receipt commit together. Stock action receipts replay exactly before state
  validation. Medicine deletion cascades to stock movements and action receipts.
  Intake (#47) needs no request of its own: an insertion trigger on each dose version (first
  log, correction, Unscheduled log, change or removal) records one intake movement with the
  difference between what its previous and new versions count, applied to the stored count in
  the same statement, so retries and refused writes move nothing. A version counts against the
  current reconciliation point (`stock_started_at`) by minute. The stored count rounds to tenths
  and keeps a negative remainder; reads show it floored at 0 with `intakePastCount`. Dose saves
  never change the Medicine revision.
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
- **Dose history:** `GET /api/dose-history?medicineId=&before=` reads one medication's Taken
  doses at their latest values: scheduled under any of its Schedule versions and Unscheduled,
  grouped by the Istanbul day of their intake time, newest first. A page holds whole days; `before`
  is the oldest day returned and null after the first Taken dose. The first page adds the summary:
  the last dose and today, 7-day and 30-day totals. Totals sum the Quantity unit per saved strength
  snapshot. An Archived medicine reads normally; an unknown or another owner's medication returns
  404 `not_found`.
- **Device registrations:** `/api/device-registration` reads with `GET ?installationId=`
  and saves (`PUT`), renews (`PATCH`) and removes (`DELETE`) with a JSON body. The Firebase
  installation ID is the row key: save upserts it, updating an existing row only for its
  owner or when the supplied token matches. The conditional write can move the row to the
  caller; a refused move leaves it unchanged and answers `registered: false`. Save derives
  `registered` from the write. Renew updates only the caller's row; remove is idempotent.
  Every response is `{ registered }`; the
  token is stored for the sender and never returned or logged. The browser gets both from
  Firebase in `device-registrations/notification-device.ts`, loaded on first use, and
  `public/sw.js` displays incoming messages. `device-registrations/registration-upkeep.tsx`
  renews or removes a remembered registration once per signed-in launch and on Sign out.
- **Quiet hours:** `/api/quiet-hours` reads with `GET` and sets with `PUT`
  `{ actionId, quietHours }`; every response is `{ quietHours }`. An account with no
  `account_preferences` row reads as off. A set inserts an owner-scoped receipt keyed by its
  action UUID whose trigger applies the value in the same statement, so a retry returns its
  original outcome and writes nothing, and a reused action ID with another value returns
  conflict. The due-reminder operation reads the preference at send time.
- **Medication names:** `/api/medication-names` reads with `GET` and sets with `PUT`
  `{ actionId, medicationNames }`; every response is `{ medicationNames }`. It shares the
  `account_preferences` row with Quiet hours, reads as off without one, and keeps its own receipts
  with the Quiet hours retry and conflict rules; the two read and set independently. The
  due-reminder operation reads it, and the Medicine labels, at send time and adds labels to the
  provider message only when on.
- **Snoozes:** `/api/snoozes` accepts `POST { actionId, scheduleId, dueAt }` and answers
  `{ outcome: 'snoozed' | 'dropped', targetAt }` or `{ outcome: 'rejected', reason }`; a
  rejection writes nothing. An accepted Snooze is one `snoozes` row keyed by its reserved
  Follow-up reminder and its action UUID, so a retry returns its original outcome and a reused
  action ID naming another dose returns conflict. The due-reminder operation sends it and drops
  the automatic reminders it rules out at send time.
- **Schema changes:** write each migration by hand as the next numbered
  `worker/migrations/NNNN_<name>.sql` and mirror it in the Drizzle tables in
  `worker/schema.ts`. The local stack, tests and Release apply migrations in order. Keep
  each one additive and backward compatible, since the old app with the new Worker and the
  old Worker with the new schema coexist during release and recovery: a new column is
  nullable or has a default. Leave applied migrations unchanged and repair forward with a
  new one. A destructive change needs a separately planned expand/contract rollout and a
  backup and recovery review. Never drop or rebuild a table with `ON DELETE CASCADE`
  children: D1 executes those cascades even with `PRAGMA defer_foreign_keys = ON`, so
  copying the parent rows back does not restore its children. In particular, do not reuse
  migration 0017's `user_medications` rebuild now that stock movements, stock action
  receipts and intake stock movements cascade from it. Use additive changes instead;
  seed existing rows before later migrations in tests to prove they survive.

Client retry and action-ID rules: [client state](client-state.md#saves).

## Automated dependency checks

`pnpm lint` runs ESLint plus `scripts/check-architecture.mjs`, an architecture-only pass that
inline `eslint-disable` cannot bypass. `eslint-rules/architecture.mjs` owns the module roles,
the runtime-neutral surface and the named exceptions, with fixtures in
`tests/architecture-lint.test.ts`; `tests/architecture-build.test.ts` proves Next.js rejects
indirect browser-to-server imports. Each violation names the boundary it crosses: move the
code to the layer that owns it; a new named exception changes the rule and its fixtures.
