'use client'

import { useId, useState, type KeyboardEvent, type RefObject } from 'react'
import { Controller, useForm, useWatch, type FieldErrors } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { QuantityStepper } from '@/components/quantity-stepper'
import { InfoIcon } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { DatePicker } from '@/components/ui/date-picker'
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
  FieldTitle,
} from '@/components/ui/field'
import { TimePicker } from '@/components/ui/time-picker'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { formatTime } from '@/lib/calendar-date'
import { useKnownOffline } from '@/lib/use-known-offline'
import { useSessionFormDraft } from '@/lib/use-session-form-draft'
import type { Medicine } from '@/features/medicines/contract'
import { saveMessages } from '@/lib/save-messages'
import type { DoseOccurrence } from './contract'
import { DoseSaveProblem } from './dose-save-problem'
import { useCurrentMinute } from './use-current-minute'
import type { AttemptForm, SaveProblem } from './dose-saves'
import {
  instantOf,
  localMinute,
  previousDate,
  takenAtLocal,
  takenFormDefaults,
  takenFormSchema,
  type TakenAtChoice,
  type TakenFormOutput,
  type TakenFormValues,
} from './taken-form-schema'

// A swipe that starts on a control never closes the drawer.
const swipeIgnore = { 'data-base-ui-swipe-ignore': 'y' }

function offsetLabel(local: string, dueAt: string) {
  const minutes = Math.round((instantOf(local).getTime() - new Date(dueAt).getTime()) / 60000)
  if (!Number.isFinite(minutes)) return ''
  if (minutes === 0) return 'Same as scheduled'
  const size = Math.abs(minutes)
  const span =
    size < 60 ? `${size} min` : `${Math.floor(size / 60)} h${size % 60 ? ` ${size % 60} min` : ''}`
  return `${span} ${minutes > 0 ? 'after' : 'before'} scheduled`
}

const screenOrder = ['when', 'date', 'time', 'quantity'] as const

type Mode = 'record' | 'edit' | 'correct'

const primaryLabels: Record<Mode, { save: string; retry: string }> = {
  record: { save: 'Save as taken', retry: 'Try saving as taken again' },
  edit: { save: 'Save changes', retry: 'Try saving changes again' },
  correct: { save: 'Save changes', retry: 'Try saving your change again' },
}

/**
 * Actual intake details for a Taken outcome. `record` opens from the
 * drawer's outcome choice, `correct` changes a Skipped dose to Taken, and `edit` opens a recorded
 * intake through Edit dose. Values stay here; the parent's mutation owns saving, the duplicate
 * lock, retry identity and errors.
 */
export function TakenForm({
  dose,
  medicine,
  open,
  saving,
  reviewRequired = false,
  problem,
  onOpen,
  onSubmit,
  mode = 'record',
  restore,
  draftKey = null,
  nowRef,
}: {
  dose: DoseOccurrence
  medicine: Medicine
  open: boolean
  saving: boolean
  reviewRequired?: boolean
  /** Why the last save was not confirmed; an uncertain retry with unchanged details saves once. */
  problem: SaveProblem | null
  onOpen: (open: boolean) => void
  onSubmit: (details: TakenFormOutput, form: AttemptForm) => Promise<void>
  mode?: Mode
  /** An unconfirmed attempt's values and Now minute, so reopening retries it exactly. */
  restore?: AttemptForm
  /** Keeps unsaved values for the session across navigation (#120 store). */
  draftKey?: string | null
  /** The Now choice, the form's first control, for the drawer's open focus. */
  nowRef?: RefObject<HTMLButtonElement | null>
}) {
  const id = useId()
  // A pending or unconfirmed Now save keeps its minute, so a retry has the same details.
  const uncertain = problem?.kind === 'uncertain'
  const now = useCurrentMinute(!saving && !uncertain, uncertain ? restore?.now : undefined)
  const offline = useKnownOffline()
  const scheduled = localMinute(dose.dueAt)
  const original =
    dose.status === 'Taken'
      ? { local: localMinute(dose.record.takenAt), instant: dose.record.takenAt }
      : undefined
  const schema = takenFormSchema({
    unit: medicine.unit,
    now,
    scheduled,
    dueAt: dose.dueAt,
    original: mode === 'edit' ? original : undefined,
  })
  const form = useForm<TakenFormValues, unknown, TakenFormOutput>({
    resolver: zodResolver(schema),
    // Other's pickers register after Amount, so focus follows screen order instead (onInvalid).
    shouldFocusError: false,
    defaultValues:
      (restore?.values as TakenFormValues | undefined) ??
      takenFormDefaults(
        dose.status === 'Taken' ? dose.record.quantity : dose.quantity,
        mode === 'edit' ? original : undefined,
      ),
  })
  const draft = useSessionFormDraft(draftKey, form)
  const values = useWatch({ control: form.control })
  // Validated details of the last submit. The mutation reuses its action id while they match,
  // so a change after an unconfirmed save starts a new one.
  const [submitted, setSubmitted] = useState<string | null>(() =>
    restore ? JSON.stringify(schema.safeParse(restore.values).data ?? null) : null,
  )
  const changedSinceSave =
    uncertain && submitted !== JSON.stringify(schema.safeParse(values).data ?? null)

  // The scheduled minute itself is neither early nor passed.
  const beforeScheduled = now < scheduled
  const scheduledHasPassed = scheduled < now
  const takenAt = takenAtLocal(values, now, scheduled)
  const today = now.slice(0, 10)
  const yesterday = previousDate(today)
  const labels = primaryLabels[mode]

  async function save(details: TakenFormOutput) {
    setSubmitted(JSON.stringify(details))
    await onSubmit(details, { values: form.getValues(), now })
  }

  function focusFirstInvalid(errors: FieldErrors<TakenFormValues>) {
    const first = screenOrder.find((name) => errors[name])
    if (first) form.setFocus(first)
  }

  function choose(next: TakenAtChoice) {
    if (next === 'other' && !form.getValues('date')) {
      const from = values.when === 'scheduled' ? scheduled : now
      form.setValue('date', from.slice(0, 10))
      form.setValue('time', from.slice(11))
    }
  }

  return (
    <>
      {mode === 'edit' && (
        <Button
          type="button"
          variant="outline"
          aria-expanded={open}
          aria-controls={id}
          aria-label={`Edit dose for ${medicine.label} at ${formatTime(dose.dueAt)}`}
          disabled={saving}
          onClick={() => {
            if (!open && dose.status === 'Taken') {
              setSubmitted(null)
              form.reset(takenFormDefaults(dose.record.quantity, original))
            }
            onOpen(!open)
          }}
        >
          Edit dose
        </Button>
      )}
      <form
        id={id}
        noValidate
        hidden={!open}
        className="basis-full"
        // Wrapped so building the handler during render never touches the submit ref.
        onSubmit={(event) => void form.handleSubmit(save, focusFirstInvalid)(event)}
        aria-busy={saving}
        onKeyDown={(event: KeyboardEvent<HTMLFormElement>) => {
          // Picker popups are portaled; their Escape only closes the popup.
          const inForm = event.currentTarget.contains(event.target as Node)
          if (event.key === 'Escape' && !saving && inForm) {
            event.preventDefault()
            onOpen(false)
          }
        }}
      >
        <FieldSet disabled={saving} className="min-w-0 gap-4.5">
          <FieldLegend className="sr-only">What you took: {medicine.label}</FieldLegend>
          {/* Closing the drawer is this form's Clear form: dismissal discards the draft. */}
          {draft.restored && (
            <p className="text-body-sm text-muted-foreground">{saveMessages.draftRestored}</p>
          )}
          {mode !== 'edit' && beforeScheduled && (
            <Alert>
              <InfoIcon aria-hidden="true" />
              <AlertDescription>
                This dose is scheduled for {formatTime(dose.dueAt)}. Saving now records it early.
              </AlertDescription>
            </Alert>
          )}
          <FieldGroup className="gap-4.5">
            <Controller
              name="when"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid} className="gap-2.5">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                    <FieldTitle id={`${id}-when`} className="font-extrabold">
                      Taken at
                    </FieldTitle>
                    <span className="text-label font-semibold text-muted-foreground">
                      {takenAt && offsetLabel(takenAt, dose.dueAt)}
                    </span>
                  </div>
                  <ToggleGroup
                    {...swipeIgnore}
                    aria-labelledby={`${id}-when`}
                    aria-describedby={fieldState.invalid ? `${id}-when-error` : undefined}
                    variant="outline"
                    className="w-full flex-wrap"
                    value={[field.value]}
                    onValueChange={(value) => {
                      const next = value[0] as TakenAtChoice | undefined
                      if (!next) return
                      choose(next)
                      field.onChange(next)
                    }}
                    onBlur={field.onBlur}
                  >
                    {/* RHF focuses the chosen item when the choice is invalid. */}
                    <ToggleGroupItem
                      ref={(node) => {
                        if (nowRef) nowRef.current = node
                        if (field.value === 'now') field.ref(node)
                      }}
                      value="now"
                      className="flex-1"
                    >
                      Now · {now.slice(11)}
                    </ToggleGroupItem>
                    {(scheduledHasPassed || field.value === 'scheduled') && (
                      <ToggleGroupItem
                        ref={field.value === 'scheduled' ? field.ref : undefined}
                        value="scheduled"
                        className="flex-1"
                        aria-invalid={fieldState.invalid || undefined}
                      >
                        At {formatTime(dose.dueAt)}
                      </ToggleGroupItem>
                    )}
                    <ToggleGroupItem
                      ref={field.value === 'other' ? field.ref : undefined}
                      value="other"
                    >
                      Other
                    </ToggleGroupItem>
                  </ToggleGroup>
                  <FieldError id={`${id}-when-error`} errors={[fieldState.error]} />
                </Field>
              )}
            />
            {values.when === 'other' && (
              <div className="grid gap-3 min-[400px]:grid-cols-2">
                <Controller
                  name="date"
                  control={form.control}
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid} {...swipeIgnore}>
                      <FieldLabel htmlFor={`${id}-date`}>Taken date</FieldLabel>
                      <DatePicker
                        ref={field.ref}
                        id={`${id}-date`}
                        label="Taken date in Istanbul"
                        today={today}
                        min={yesterday}
                        max={today}
                        value={field.value}
                        onValueChange={field.onChange}
                        onBlur={field.onBlur}
                        disabled={saving}
                        aria-invalid={fieldState.invalid}
                        aria-describedby={fieldState.invalid ? `${id}-date-error` : undefined}
                      />
                      <FieldError id={`${id}-date-error`} errors={[fieldState.error]} />
                    </Field>
                  )}
                />
                <Controller
                  name="time"
                  control={form.control}
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid} {...swipeIgnore}>
                      <FieldLabel htmlFor={`${id}-time`}>Taken time</FieldLabel>
                      <TimePicker
                        ref={field.ref}
                        id={`${id}-time`}
                        label="Taken time in Istanbul"
                        value={field.value}
                        onValueChange={field.onChange}
                        onBlur={field.onBlur}
                        disabled={saving}
                        aria-invalid={fieldState.invalid}
                        aria-describedby={fieldState.invalid ? `${id}-time-error` : undefined}
                      />
                      <FieldError id={`${id}-time-error`} errors={[fieldState.error]} />
                    </Field>
                  )}
                />
              </div>
            )}
            <Controller
              name="quantity"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field
                  data-invalid={fieldState.invalid}
                  className="gap-2 rounded-lg border bg-card py-2 pr-2 pl-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <FieldLabel htmlFor={`${id}-quantity`} className="font-extrabold">
                      Amount
                    </FieldLabel>
                    <div {...swipeIgnore}>
                      <QuantityStepper
                        ref={field.ref}
                        id={`${id}-quantity`}
                        label="Amount"
                        unit={medicine.unit}
                        value={field.value}
                        onValueChange={field.onChange}
                        onBlur={field.onBlur}
                        disabled={saving}
                        aria-invalid={fieldState.invalid}
                        aria-describedby={fieldState.invalid ? `${id}-quantity-error` : undefined}
                      />
                    </div>
                  </div>
                  <FieldError id={`${id}-quantity-error`} errors={[fieldState.error]} />
                </Field>
              )}
            />
          </FieldGroup>
          {!saving && (
            <DoseSaveProblem
              id={`${id}-problem`}
              outcome="Taken"
              problem={problem}
              offline={offline}
              changed={changedSinceSave}
            />
          )}
          <div className="flex flex-col gap-1.5">
            <Button
              type="submit"
              size="drawer"
              className="w-full whitespace-normal"
              disabled={saving || offline || reviewRequired}
              aria-describedby={!saving && (problem || offline) ? `${id}-problem` : undefined}
            >
              {saving
                ? 'Saving...'
                : offline
                  ? saveMessages.connectToSave
                  : uncertain && !changedSinceSave
                    ? labels.retry
                    : labels.save}
            </Button>
            <Button type="button" variant="ghost" className="w-full" onClick={() => onOpen(false)}>
              Cancel
            </Button>
          </div>
        </FieldSet>
      </form>
    </>
  )
}
