# Forms

Data-entry forms compose React Hook Form, Zod and `zodResolver` directly with the shadcn
Field components, following the
[official guide](https://ui.shadcn.com/docs/forms/react-hook-form). The reference is Add
medicine: [`medicine-form.tsx`](../src/features/medicines/medicine-form.tsx) with
[`medicine-form-schema.ts`](../src/features/medicines/medicine-form-schema.ts). Each form is
written out by hand, without a generic form builder or the legacy shadcn `Form` wrapper.
Visual rules and copy: [DESIGN.md](../DESIGN.md).

- **Schema, defaults and types:** keep a client schema beside the feature. It mirrors the
  contract parser's trimming, limits and enums for inline feedback; the runtime-neutral
  contract parser stays authoritative on the server. Derive editing values with `z.input`
  and submitted values with `z.output`; editing values may be wider (an empty unit before a
  choice, blank numeric text) and only the schema converts them. Pass explicit
  `defaultValues` to `useForm<Input, unknown, Output>`.
- **Controls:** render every field with `Controller` and `Field`, `FieldLabel`,
  `FieldDescription` and `FieldError`. Set `data-invalid` on `Field`, `aria-invalid` on the
  control and `aria-describedby` to the error then the help. Put `noValidate` on the form so
  inline errors replace browser bubbles; keep useful native attributes such as
  `autoComplete` and `enterKeyHint`. Base UI controls (Select, ToggleGroup) map
  `value`/`onValueChange` to `field.value`/`field.onChange`, forward `field.onBlur`, and
  attach `field.ref` to the element that should take focus.
- **Date and time:** `DatePicker` and `TimePicker` are fully controlled and stateless, so
  `reset(defaults)` updates them without keys; their JSDoc gives the value format, focus
  target and blur behavior. Pass `field.ref` straight to `ref`, and DatePicker the Istanbul
  `today`. A half-chosen time is incomplete:
  `z.string().refine(isTimeOfDay, 'Choose a time.')` with `isTimeOfDay` from
  `@/lib/time-of-day`. [`taken-form.tsx`](../src/features/schedules/taken-form.tsx) shows both
  bound.
- **Validation:** keep the defaults: validate on submit, then revalidate erroneous fields on
  change. `shouldFocusError` focuses the first invalid control in registration order. When
  a control mounts conditionally above others (the intake form's _Other_ date and time),
  set `shouldFocusError: false` and focus the first error in screen order from
  `handleSubmit`'s invalid callback, as `taken-form.tsx` does.
- **Submission:** `handleSubmit` awaits the real save, reconciliation included. A
  synchronous ref lock is the duplicate-submit guard; `isSubmitting` only drives the
  disabled fieldset and _Saving…_ label. Reuse the action ID while the validated values are
  unchanged so retrying an unconfirmed save writes once; edits start a new one
  ([client state](client-state.md#saves)).
- **Errors and reset:** report request failures with `setError('root.server', { type })`
  and render one form-level Alert above the primary action; values are always kept. Root
  errors clear on the next submit. After server confirmation, `reset(defaults)` and clear
  the action ID. Known offline (`navigator.onLine` false) disables the primary as
  _Connect to save_ with an Alert, and nothing is queued.
- **Add medicine:** `useMedicineSave` owns transport, attempt identity, receipt matching,
  reconciliation, confirmed cache publication and session draft clearing. The form submits
  validated values and observes readonly save state; reset, navigation and messages stay in
  the form. Its session store supplies the synchronous duplicate-submit lock.
- **Initial schedule setup:** `useScheduleSave` owns transport, attempt identity, confirmation
  matching, confirmed cache publication and session draft clearing. The form submits validated
  values and observes readonly save state. Unconfirmed saves recover through retry of the exact
  attempt, including its start date; background refresh runs independently of completion.
  Clock and Interval schedules share that attempt, one form each; the Interval schedule draft
  and the chosen kind sit beside the Clock schedule draft, and Cancel's Discard clears all three.
  Both forms carry the optional Last day as `lastDay`, sent as the contract's `endDate`; its
  earliest day rule lives in `last-day.ts`.
- **Stop schedule:** `useScheduleStop` saves through the same session store, keyed by medicine
  because the confirmed stop replaces the version it names before the save settles. Its confirm
  drawer holds while stopping, retries the same stop after an unknown result, and treats a
  rejection as the stale-change recovery.
- **Intake form exception:** `taken-form.tsx` takes errors and the saving state from
  `useDoseOutcomeMutation`, which observes the session dose save store (`dose-saves.ts`) for
  Taken, Skipped and corrections. The store's pending flag is the duplicate-submit lock; the
  form holds values only, so the store stays the single mutation owner.
- **Dynamic rows:** `useFieldArray` with its generated `id` as the React key, row-level
  errors from the row's schema path, and per-row labels such as _Time 2_.
- **State ownership:** React Hook Form owns only the values on screen. Session drafts and
  save lifetime belong to [client state](client-state.md#session-drafts); restoring a draft
  resets the form, and refreshes leave dirty fields alone.
- **Native GET filters**, such as the History date, stay plain query-parameter forms.
