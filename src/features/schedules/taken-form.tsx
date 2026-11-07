'use client'

import { useId, useState, type KeyboardEvent } from 'react'
import { Controller, useForm, useWatch, type FieldErrors } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { InfoIcon } from 'lucide-react'
import { QuantityStepper } from '@/components/quantity-stepper'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
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
import { useKnownOffline } from '@/lib/use-known-offline'
import type { Medicine } from '@/features/medicines/contract'
import type { DoseOccurrence } from './contract'
import { useCurrentMinute } from './use-current-minute'
import {
  doseClock,
  instantOf,
  localMinute,
  previousDate,
  takenFormDefaults,
  takenFormSchema,
  type TakenAtChoice,
  type TakenFormOutput,
  type TakenFormValues,
} from './taken-form-schema'

export { doseClock }

// A swipe that starts on a control never closes the drawer (FE-648 D14).
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

const primary: Record<Mode, { save: string; retry: string }> = {
  record: { save: 'Save as taken', retry: 'Retry saving as taken' },
  edit: { save: 'Save intake changes', retry: 'Retry saving intake changes' },
  correct: { save: 'Save correction', retry: 'Retry saving correction' },
}

/**
 * Actual intake details for a Taken outcome (FE-648 R2/R3, C1 to C5). `record` opens from the
 * drawer's outcome choice, `correct` changes a Skipped dose to Taken, and `edit` opens a recorded
 * intake through Edit intake. Values stay here; the parent's mutation owns saving, the duplicate
 * lock, retry identity and errors.
 */
export function TakenForm({
  dose,
  medicine,
  open,
  saving,
  error,
  uncertain = false,
  onOpen,
  onSubmit,
  mode = 'record',
}: {
  dose: DoseOccurrence
  medicine: Medicine
  open: boolean
  saving: boolean
  error: string
  /** The last save could not be confirmed; a retry with unchanged details saves once. */
  uncertain?: boolean
  onOpen: (open: boolean) => void
  onSubmit: (details: TakenFormOutput) => Promise<void>
  mode?: Mode
}) {
  const id = useId()
  // A pending or unconfirmed Now save keeps its minute, so a retry has the same details (D12, F4).
  const now = useCurrentMinute(!saving && !uncertain)
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
    original: mode === 'edit' ? original : undefined,
  })
  const form = useForm<TakenFormValues, unknown, TakenFormOutput>({
    resolver: zodResolver(schema),
    // Other's pickers register after Amount, so focus follows screen order instead (onInvalid).
    shouldFocusError: false,
    defaultValues: takenFormDefaults(
      dose.status === 'Taken' ? dose.record.quantity : dose.quantity,
      mode === 'edit' ? original : undefined,
    ),
  })
  const values = useWatch({ control: form.control })
  // Validated details of the last submit. The mutation reuses its action id while they match,
  // so a change after an unconfirmed save starts a new one (F4).
  const [submitted, setSubmitted] = useState<string | null>(null)
  const changedSinceSave =
    uncertain && submitted !== JSON.stringify(schema.safeParse(values).data ?? null)

  const scheduledHasPassed = scheduled <= now
  const takenAt =
    values.when === 'now'
      ? now
      : values.when === 'scheduled'
        ? scheduled
        : values.date && values.time
          ? `${values.date}T${values.time}`
          : ''
  const today = now.slice(0, 10)
  const yesterday = previousDate(today)
  const labels = primary[mode]

  async function save(details: TakenFormOutput) {
    setSubmitted(JSON.stringify(details))
    await onSubmit(details)
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
          aria-label={`Edit intake for ${medicine.label} at ${doseClock(dose.dueAt)}`}
          disabled={saving}
          onClick={() => {
            if (!open && dose.status === 'Taken') {
              setSubmitted(null)
              form.reset(takenFormDefaults(dose.record.quantity, original))
            }
            onOpen(!open)
          }}
        >
          Edit intake
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
          <FieldLegend className="sr-only">Actual intake for {medicine.label}</FieldLegend>
          {mode !== 'edit' && !scheduledHasPassed && (
            <Alert>
              <InfoIcon aria-hidden="true" />
              <AlertDescription>
                This dose is scheduled for {doseClock(dose.dueAt)}. Saving now records it early.
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
                      ref={field.value === 'now' ? field.ref : undefined}
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
                        At {doseClock(dose.dueAt)}
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
          {uncertain && !saving ? (
            <Alert id={`${id}-problem`} variant="destructive">
              <AlertTitle>Save could not be confirmed.</AlertTitle>
              <AlertDescription>
                Your details are still here.{' '}
                {changedSinceSave
                  ? 'Changing details starts a new save.'
                  : 'Connect and retry; it will not be saved twice.'}
              </AlertDescription>
            </Alert>
          ) : offline && !saving ? (
            <Alert id={`${id}-problem`}>
              <InfoIcon aria-hidden="true" />
              <AlertDescription>You&apos;re offline. Your details stay here.</AlertDescription>
            </Alert>
          ) : error ? (
            <Alert id={`${id}-problem`} variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          <div className="flex flex-col gap-1.5">
            <Button
              type="submit"
              size="drawer"
              className="w-full whitespace-normal"
              disabled={saving || offline}
              aria-describedby={error || offline ? `${id}-problem` : undefined}
            >
              {saving
                ? 'Saving...'
                : offline
                  ? 'Connect to save'
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
