'use client'

import { useId, useState, type ReactNode } from 'react'
import { Controller, useForm, useWatch, type FieldErrors } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { QuantityStepper } from '@/components/quantity-stepper'
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
import type { Medicine } from '@/features/medicines/contract'
import { saveMessages } from '@/lib/save-messages'
import { useKnownOffline } from '@/lib/use-known-offline'
import { useSessionFormDraft } from '@/lib/use-session-form-draft'
import type { AttemptForm, SaveProblem } from '../schedules/dose-save-state'
import { DoseSaveProblem } from '../schedules/dose-save-problem'
import {
  previousDate,
  takenFormSchema,
  type TakenAtChoice,
  type TakenFormOutput,
  type TakenFormValues,
} from '../schedules/taken-form-schema'
import { useCurrentMinute } from '../schedules/use-current-minute'
import { conflictMessage } from './unscheduled-saves'

// A swipe that starts on a control never closes the drawer.
const swipeIgnore = { 'data-base-ui-swipe-ignore': 'y' }

const screenOrder = ['when', 'date', 'time', 'quantity'] as const

/**
 * What an Unscheduled dose took (241·A3, A4, A8, S1): Taken at (Now or Other, today or
 * yesterday) and Amount, under the Taken form rules with no scheduled time, so there is no
 * "At scheduled" choice. Values stay here; the session save owns saving, retry identity and errors.
 */
export function UnscheduledDoseForm({
  medicine,
  defaults,
  original,
  saving,
  problem,
  conflict,
  labels,
  restore,
  draftKey,
  onSubmit,
  onCancel,
  extra,
}: {
  medicine: Medicine
  defaults: TakenFormValues
  /** A saved dose's intake: an unchanged minute keeps its exact instant. */
  original?: { local: string; instant: string }
  saving: boolean
  /** Why the last save was not confirmed; an uncertain retry with unchanged details saves once. */
  problem: SaveProblem | null
  conflict: boolean
  labels: { save: string; retry: string }
  /** An unconfirmed attempt's values and Now minute, so reopening retries it exactly. */
  restore?: AttemptForm
  /** Keeps unsaved values for the session across navigation. */
  draftKey: string | null
  onSubmit: (details: TakenFormOutput, form: AttemptForm) => void
  onCancel: () => void
  /** Below Cancel, such as Remove dose. */
  extra?: ReactNode
}) {
  const id = useId()
  // A pending or unconfirmed Now save keeps its minute, so a retry has the same details.
  const uncertain = problem?.kind === 'uncertain'
  const now = useCurrentMinute(!saving && !uncertain, uncertain ? restore?.now : undefined)
  const offline = useKnownOffline()
  const schema = takenFormSchema({ unit: medicine.unit, now, scheduled: now, original })
  const form = useForm<TakenFormValues, unknown, TakenFormOutput>({
    resolver: zodResolver(schema),
    // Other's pickers register after Amount, so focus follows screen order instead (onInvalid).
    shouldFocusError: false,
    defaultValues: (restore?.values as TakenFormValues | undefined) ?? defaults,
  })
  const draft = useSessionFormDraft(draftKey, form)
  const values = useWatch({ control: form.control })
  // Validated details of the last submit; a change after an unconfirmed save starts a new one.
  const [submitted, setSubmitted] = useState<string | null>(() =>
    restore ? JSON.stringify(schema.safeParse(restore.values).data ?? null) : null,
  )
  const changedSinceSave =
    uncertain && submitted !== JSON.stringify(schema.safeParse(values).data ?? null)
  const today = now.slice(0, 10)

  function save(details: TakenFormOutput) {
    setSubmitted(JSON.stringify(details))
    onSubmit(details, { values: form.getValues(), now })
  }

  function focusFirstInvalid(errors: FieldErrors<TakenFormValues>) {
    const first = screenOrder.find((name) => errors[name])
    if (first) form.setFocus(first)
  }

  return (
    <form
      noValidate
      onSubmit={(event) => void form.handleSubmit(save, focusFirstInvalid)(event)}
      aria-busy={saving}
    >
      <FieldSet disabled={saving} className="min-w-0 gap-4.5">
        <FieldLegend className="sr-only">What you took: {medicine.label}</FieldLegend>
        {draft.restored && (
          <p className="text-body-sm text-muted-foreground">{saveMessages.draftRestored}</p>
        )}
        <FieldGroup className="gap-4.5">
          <Controller
            name="when"
            control={form.control}
            render={({ field }) => (
              <Field className="gap-2.5">
                <FieldTitle id={`${id}-when`} className="font-extrabold">
                  Taken at
                </FieldTitle>
                <ToggleGroup
                  {...swipeIgnore}
                  aria-labelledby={`${id}-when`}
                  variant="outline"
                  className="w-full flex-wrap"
                  value={[field.value]}
                  onValueChange={(value) => {
                    const next = value[0] as TakenAtChoice | undefined
                    if (!next) return
                    if (next === 'other' && !form.getValues('date')) {
                      form.setValue('date', today)
                      form.setValue('time', now.slice(11))
                    }
                    field.onChange(next)
                  }}
                  onBlur={field.onBlur}
                >
                  <ToggleGroupItem
                    ref={field.value === 'now' ? field.ref : undefined}
                    value="now"
                    className="flex-1"
                  >
                    Now · {now.slice(11)}
                  </ToggleGroupItem>
                  <ToggleGroupItem
                    ref={field.value === 'other' ? field.ref : undefined}
                    value="other"
                    className="flex-1"
                  >
                    Other
                  </ToggleGroupItem>
                </ToggleGroup>
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
                      min={previousDate(today)}
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
        {conflict ? (
          <Alert id={`${id}-problem`} variant="destructive">
            <AlertDescription>{conflictMessage}</AlertDescription>
          </Alert>
        ) : (
          !saving && (
            <DoseSaveProblem
              id={`${id}-problem`}
              outcome="Taken"
              problem={problem}
              offline={offline}
              changed={changedSinceSave}
            />
          )
        )}
        <div className="flex flex-col gap-1.5">
          <Button
            type="submit"
            size="drawer"
            className="w-full whitespace-normal"
            disabled={saving || offline || conflict}
            aria-describedby={
              !saving && (problem || offline || conflict) ? `${id}-problem` : undefined
            }
          >
            {saving
              ? 'Saving...'
              : offline
                ? saveMessages.connectToSave
                : uncertain && !changedSinceSave
                  ? labels.retry
                  : labels.save}
          </Button>
          <Button type="button" variant="ghost" className="w-full" onClick={onCancel}>
            Cancel
          </Button>
          {extra}
        </div>
      </FieldSet>
    </form>
  )
}
