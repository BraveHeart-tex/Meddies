'use client'

import { useEffect, useRef, useState } from 'react'
import { Controller, useFieldArray, useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { InfoIcon } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { DatePicker } from '@/components/ui/date-picker'
import { Icon } from '@/components/ui/icon'
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
  FieldTitle,
} from '@/components/ui/field'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { useKnownOffline } from '@/lib/use-known-offline'
import type { Medicine } from '@/features/medicines/contract'
import type { DailySchedule } from './contract'
import {
  newTimeRow,
  scheduleFormDefaults,
  scheduleFormSchema,
  type ScheduleFormOutput,
  type ScheduleFormValues,
} from './schedule-form-schema'
import { ScheduleTimeRow } from './schedule-time-row'
import { SHORT_WEEKDAYS, WEEK_ORDER, WEEKDAY_NAMES, weekdaySummary } from './weekdays'

const MAX_TIMES = 24

/** Request failures shown at form level; a 409 leaves the form (647·S5) instead. */
type SaveProblem = 'rejected' | 'unauthorized' | 'uncertain'

/**
 * First schedule for one saved medicine (FE-647 A7 to A9, S1 to S4; FE-650 D22). Values stay
 * local; `onSaved` runs only after the server confirms, and `onConflict` when the medicine
 * already has a schedule.
 */
export function ScheduleForm({
  medicine,
  today,
  onSaved,
  onConflict,
}: {
  medicine: Medicine
  /** Istanbul today from the scheduling clock. */
  today: string
  onSaved: (schedule: DailySchedule) => void
  onConflict: () => void
}) {
  // Start date of an unconfirmed save: its retry keeps the same request after midnight.
  const [retryStartDate, setRetryStartDate] = useState<string>()
  const form = useForm<ScheduleFormValues, unknown, ScheduleFormOutput>({
    resolver: zodResolver(scheduleFormSchema({ unit: medicine.unit, today, retryStartDate })),
    defaultValues: scheduleFormDefaults(medicine.unit, today),
  })
  const rows = useFieldArray({ control: form.control, name: 'times' })
  const weekdays = useWatch({ control: form.control, name: 'weekdays' })
  const offline = useKnownOffline()
  // Retry identity: reused while the validated details are unchanged (647·S3).
  const action = useRef<{ id: string; fingerprint: string } | null>(null)
  // Synchronous duplicate-submit guard; isSubmitting updates only after a render.
  const lock = useRef(false)
  // Focus target after a row is removed, applied once the rows re-render.
  const pendingFocus = useRef<number | 'add' | null>(null)
  const addButton = useRef<HTMLButtonElement>(null)
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  useEffect(() => {
    const target = pendingFocus.current
    if (target === null) return
    pendingFocus.current = null
    if (target === 'add') addButton.current?.focus()
    else form.setFocus(`times.${target}.time`)
  })

  async function save(values: ScheduleFormOutput) {
    if (lock.current) return
    lock.current = true
    try {
      const details = { medicineId: medicine.id, ...values }
      const fingerprint = JSON.stringify(details)
      if (action.current?.fingerprint !== fingerprint)
        action.current = { id: crypto.randomUUID(), fingerprint }
      let saved: DailySchedule | null = null
      let problem: SaveProblem | 'conflict' = 'uncertain'
      try {
        const response = await fetch('/api/schedules', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...details, id: action.current.id }),
          signal: AbortSignal.timeout(12000),
        })
        if (response.ok) saved = (await response.json()).schedules[0]
        else if (response.status === 400) problem = 'rejected'
        else if (response.status === 401) problem = 'unauthorized'
        else if (response.status === 409) problem = 'conflict'
      } catch {}
      if (saved) {
        action.current = null
        if (mounted.current) {
          setRetryStartDate(undefined)
          form.reset(scheduleFormDefaults(medicine.unit, today))
        }
        onSaved(saved)
        return
      }
      if (!mounted.current) return
      if (problem === 'conflict') return onConflict()
      // A definite rejection was not stored: the next save is a new request.
      if (problem !== 'uncertain') action.current = null
      setRetryStartDate(problem === 'uncertain' ? values.startDate : undefined)
      form.setError('root.server', { type: problem })
    } finally {
      lock.current = false
    }
  }

  // Duplicate-time errors depend on other rows: revalidate every row once errors are showing.
  function revalidateRows() {
    if (form.formState.isSubmitted) void form.trigger('times')
  }

  function removeRow(index: number) {
    pendingFocus.current = index + 1 < rows.fields.length ? index : 'add'
    rows.remove(index)
    revalidateRows()
  }

  const { isSubmitting, errors } = form.formState
  const problem = errors.root?.server?.type as SaveProblem | undefined
  const minDate = retryStartDate && retryStartDate < today ? retryStartDate : today

  return (
    <form
      noValidate
      // Wrapped so building the handler during render never touches the save refs.
      onSubmit={(event) => void form.handleSubmit(save)(event)}
      aria-busy={isSubmitting}
      aria-labelledby="schedule-heading"
      className="flex flex-col gap-5"
    >
      <FieldSet disabled={isSubmitting} className="disabled:opacity-70">
        <FieldLegend className="sr-only">Schedule for {medicine.label}</FieldLegend>
        <FieldGroup>
          <Controller
            name="weekdays"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldTitle id="schedule-days-label">Days</FieldTitle>
                <ToggleGroup
                  multiple
                  variant="outline"
                  size="sm"
                  spacing={1.5}
                  className="grid w-full grid-cols-4 min-[344px]:grid-cols-7"
                  aria-labelledby="schedule-days-label"
                  aria-describedby={
                    fieldState.invalid
                      ? 'schedule-days-error schedule-days-summary'
                      : 'schedule-days-summary'
                  }
                  value={field.value.map(String)}
                  onValueChange={(value) => field.onChange(value.map(Number))}
                  onBlur={field.onBlur}
                  disabled={isSubmitting}
                >
                  {WEEK_ORDER.map((day, index) => (
                    <ToggleGroupItem
                      key={day}
                      value={String(day)}
                      aria-label={WEEKDAY_NAMES[day]}
                      // RHF focuses Monday when no day is chosen (647·S1).
                      ref={index === 0 ? field.ref : undefined}
                      aria-invalid={fieldState.invalid || undefined}
                      className="min-w-0 px-0"
                    >
                      {SHORT_WEEKDAYS[day]}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
                <FieldError id="schedule-days-error" errors={[fieldState.error]} />
                <FieldDescription id="schedule-days-summary">
                  {weekdays.length > 0 ? weekdaySummary(weekdays, 'short') : 'No days chosen'}
                </FieldDescription>
              </Field>
            )}
          />
          <Controller
            name="startDate"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="schedule-start">Start date</FieldLabel>
                <DatePicker
                  ref={field.ref}
                  id="schedule-start"
                  label="Start date"
                  today={today}
                  min={minDate}
                  max="2099-12-31"
                  value={field.value}
                  onValueChange={field.onChange}
                  onBlur={field.onBlur}
                  disabled={isSubmitting}
                  aria-invalid={fieldState.invalid}
                  aria-describedby={fieldState.invalid ? 'schedule-start-error' : undefined}
                />
                <FieldError id="schedule-start-error" errors={[fieldState.error]} />
              </Field>
            )}
          />
          <FieldDescription id="quantity-help">
            Quantity is how much you take each time, not the product strength.
          </FieldDescription>
          {rows.fields.map((row, index) => (
            <ScheduleTimeRow
              key={row.id}
              control={form.control}
              index={index}
              rowId={row.id}
              unit={medicine.unit}
              disabled={isSubmitting}
              onTimeChange={revalidateRows}
              onRemove={rows.fields.length > 1 ? () => removeRow(index) : undefined}
            />
          ))}
          {rows.fields.length < MAX_TIMES && (
            <Button
              ref={addButton}
              type="button"
              variant="outline"
              className="self-start"
              onClick={() =>
                rows.append(newTimeRow(medicine.unit), {
                  focusName: `times.${rows.fields.length}.time`,
                })
              }
            >
              <Icon name="plus" data-icon="inline-start" />
              Add another time
            </Button>
          )}
        </FieldGroup>
      </FieldSet>
      {offline && !isSubmitting ? (
        <Alert id="schedule-save-problem">
          <InfoIcon aria-hidden="true" />
          <AlertTitle>You&apos;re offline.</AlertTitle>
          <AlertDescription>Your details stay here until you leave this page.</AlertDescription>
        </Alert>
      ) : problem ? (
        <SaveProblemAlert problem={problem} label={medicine.label} />
      ) : null}
      <Button
        type="submit"
        size="lg"
        disabled={isSubmitting || offline}
        className="w-full whitespace-normal"
        aria-describedby={problem || offline ? 'schedule-save-problem' : undefined}
      >
        {isSubmitting
          ? 'Saving schedule...'
          : offline
            ? 'Connect to save'
            : problem === 'uncertain'
              ? 'Retry saving schedule'
              : 'Save schedule'}
      </Button>
    </form>
  )
}

function SaveProblemAlert({ problem, label }: { problem: SaveProblem; label: string }) {
  const copy = {
    uncertain: {
      title: 'Save could not be confirmed.',
      body: `${label} is saved. Its schedule details are still here; retry saves them once.`,
    },
    rejected: {
      title: "Schedule wasn't saved.",
      body: `${label} is saved without a schedule. Check the days, times and quantities, then save again.`,
    },
    unauthorized: {
      title: 'Your session ended.',
      body: `${label} is saved without a schedule. Sign in again to save it.`,
    },
  }[problem]
  return (
    <Alert id="schedule-save-problem" variant="destructive">
      <AlertTitle>{copy.title}</AlertTitle>
      <AlertDescription>{copy.body}</AlertDescription>
    </Alert>
  )
}
