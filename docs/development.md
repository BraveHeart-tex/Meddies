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
  Lint treats every `src/features/**/*.tsx` file and feature `queries.ts` as browser
  code. Server composition (prefetch, dehydrate) lives in a feature `.ts` module marked
  `server-only`, such as `schedules/prefetch.ts`, or in `src/app/**`.
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

## Forms

Data-entry forms use React Hook Form, Zod and `zodResolver` composed directly with the
shadcn Field components, following the
[official guide](https://ui.shadcn.com/docs/forms/react-hook-form). The production
reference is the Add medicine form:
[`medicine-form.tsx`](../src/features/medicines/medicine-form.tsx) with
[`medicine-form-schema.ts`](../src/features/medicines/medicine-form-schema.ts). Do not add
a generic form builder or the legacy shadcn `Form` wrapper.

- **Schema, defaults and types:** keep a client schema beside the feature. It mirrors the
  contract parser's trimming, limits and enums for inline feedback; the runtime-neutral
  contract parser stays authoritative on the server. Derive editing values with
  `z.input` and submitted values with `z.output`; editing values may be wider (an empty
  unit before a choice, blank numeric text) and only the schema converts them. Pass
  explicit `defaultValues` to `useForm<Input, unknown, Output>`.
- **Controls:** render every field with `Controller` and `Field`, `FieldLabel`,
  `FieldDescription` and `FieldError`. Set `data-invalid` on `Field`, `aria-invalid` on
  the control and `aria-describedby` to the error then the help. Put `noValidate` on the
  form so inline errors replace browser bubbles; keep useful native attributes such as
  `autoComplete` and `enterKeyHint`. Base UI controls (Select, ToggleGroup, date and time
  pickers) map `value`/`onValueChange` to `field.value`/`field.onChange`, forward
  `field.onBlur`, and attach `field.ref` to the element that should take focus.
- **Date and time pickers:** `DatePicker` and `TimePicker` are fully controlled; pass
  `field.ref` straight to `ref`. DatePicker focuses its trigger; TimePicker focuses the
  first unchosen half, so first-invalid focus lands where the user must act. Their
  `onBlur` runs only when focus leaves the whole control, popups included. TimePicker
  values are `''`, a half (`'08:'`, `':15'`) or `'HH:MM'`; validate with `isTimeOfDay`
  from `@/lib/time-of-day` and report a half as _Choose a time._ Both hold no state of
  their own, so `reset(defaults)` updates the shown date, hour and minute without keys.
  DatePicker binds the same way and also takes the Istanbul `today` (labels such as
  _Today, Fri 6 Nov_ derive from it) plus optional `min`/`max` dates. The schema treats a
  half-chosen time as incomplete:

  ```ts
  time: z.string().refine(isTimeOfDay, 'Choose a time.')
  // after a confirmed save, or when a restored draft replaces the values:
  form.reset({ date: today, time: '' })
  ```

  ```tsx
  <Controller
    name="time"
    control={form.control}
    render={({ field, fieldState }) => (
      <Field data-invalid={fieldState.invalid}>
        <FieldLabel htmlFor="dose-time">Time</FieldLabel>
        <TimePicker
          ref={field.ref}
          id="dose-time"
          label="Time"
          value={field.value}
          onValueChange={field.onChange}
          onBlur={field.onBlur}
          disabled={field.disabled}
          aria-invalid={fieldState.invalid}
          aria-describedby={fieldState.invalid ? 'dose-time-error' : undefined}
        />
        <FieldError id="dose-time-error" errors={[fieldState.error]} />
      </Field>
    )}
  />
  ```

- **Validation:** keep the defaults: validate on submit, then revalidate erroneous fields
  on change. `shouldFocusError` focuses the first invalid control in registration order.
  When a control mounts conditionally above others (the intake form's _Other_ date and
  time), set `shouldFocusError: false` and focus the first error in screen order from
  `handleSubmit`'s invalid callback, as
  [`taken-form.tsx`](../src/features/schedules/taken-form.tsx) does.
- **Submission:** `handleSubmit` awaits the real save, including reconciliation. Keep a
  synchronous ref lock against duplicate submits; `isSubmitting` drives the disabled
  fieldset and _Saving…_ label but is not the guard. Reuse a request ID while the
  validated values are unchanged so an uncertain retry saves once; edits start a new one.
- **Errors and reset:** report request failures with `setError('root.server', { type })`
  and render one form-level Alert above the primary action; values are never discarded.
  Root errors clear on the next submit. Exception: the intake form
  ([`taken-form.tsx`](../src/features/schedules/taken-form.tsx)) shows errors and the
  saving state from `useDoseOutcomeMutation`, which observes the session dose save store
  (`dose-saves.ts`) for Taken, Skipped and corrections. The store's pending flag is the
  duplicate-submit lock; the form keeps values only and must not become a second mutation
  owner. After server confirmation, `reset(defaults)` and
  clear the request ID. Known offline (`navigator.onLine` false) disables the primary as
  _Connect to save_ with an Alert; it never queues a save.
- **Dynamic rows:** use `useFieldArray` with its generated `id` as the React key, row-level
  errors from the row's schema path, and per-row labels such as _Time 2_.
- **State ownership:** RHF owns only the values on screen. Session drafts and mutation or
  cache lifetime belong to the Query/session foundations
  ([Next.js rules](agents/nextjs.md)); restoring a draft resets the form, and refreshes
  never reset dirty fields.
- **Exception:** native GET filters, such as the History date, stay plain query-parameter
  forms.
