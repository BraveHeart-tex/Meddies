'use client'

import { InfoIcon, Plus } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Controller, useFieldArray, useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { DatePicker } from '@/components/ui/date-picker'
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
import { useSessionFormDraft } from '@/lib/use-session-form-draft'
import type { Medicine } from '@/features/medicines/contract'
import type { DailySchedule } from './contract'
import { saveMessages } from '@/lib/save-messages'
import type { SaveProblem } from '@/lib/session-saves'
import { scheduleSetupKey, useScheduleSave } from './use-schedule-save'
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

/**
 * First schedule for one saved medicine (FE-647 A7 to A9, S1 to S4; FE-650 D22). Values stay
 * in session memory; `onSaved` runs only after the server confirms, and `onConflict` when the medicine
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
  const saveState = useScheduleSave(medicine, saved)
  const retryStartDate = saveState.retryStartDate
  const [defaults] = useState(() => scheduleFormDefaults(medicine.unit, today))
  const form = useForm<ScheduleFormValues, unknown, ScheduleFormOutput>({
    resolver: zodResolver(scheduleFormSchema({ unit: medicine.unit, today, retryStartDate })),
    defaultValues: defaults,
  })
  const rows = useFieldArray({ control: form.control, name: 'times' })
  const weekdays = useWatch({ control: form.control, name: 'weekdays' })
  const draft = useSessionFormDraft(scheduleSetupKey(medicine.id), form)
  const offline = useKnownOffline()
  function saved(schedule: DailySchedule) {
    form.reset(defaults)
    draft.dismissRestoreNotice()
    onSaved(schedule)
  }
  // Focus target after a row is removed, applied once the rows re-render.
  const pendingFocus = useRef<number | 'add' | null>(null)
  const addButton = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    const target = pendingFocus.current
    if (target === null) return
    pendingFocus.current = null
    if (target === 'add') addButton.current?.focus()
    else form.setFocus(`times.${target}.time`)
  })

  useEffect(() => {
    if (saveState.problem === 'conflict') onConflict()
  }, [saveState.problem, onConflict])

  // Duplicate-time errors depend on other rows: revalidate every row once errors are showing.
  function revalidateRows() {
    if (form.formState.isSubmitted) void form.trigger('times')
  }

  function removeRow(index: number) {
    pendingFocus.current = index + 1 < rows.fields.length ? index : 'add'
    rows.remove(index)
    revalidateRows()
  }

  const isSubmitting = Boolean(saveState.pending)
  const problem = saveState.problem
  const minDate = retryStartDate && retryStartDate < today ? retryStartDate : today

  return (
    <form
      noValidate
      // Wrapped so building the handler during render never touches the save refs.
      onSubmit={(event) => void form.handleSubmit(saveState.submit)(event)}
      aria-busy={isSubmitting}
      aria-labelledby="schedule-heading"
      className="flex flex-col gap-5"
    >
      {draft.restored && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-body-sm text-muted-foreground">{saveMessages.draftRestored}</p>
          <Button
            type="button"
            variant="ghost"
            disabled={isSubmitting}
            onClick={() => {
              if (saveState.pending) return
              saveState.clear()
              form.reset(scheduleFormDefaults(medicine.unit, today))
              draft.discard()
            }}
          >
            Clear form
          </Button>
        </div>
      )}
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
            Quantity is how much you take each time, not the strength on the pack.
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
              <Plus aria-hidden="true" data-icon="inline-start" />
              Add another time
            </Button>
          )}
        </FieldGroup>
      </FieldSet>
      {offline && !isSubmitting ? (
        <Alert id="schedule-save-problem">
          <InfoIcon aria-hidden="true" />
          <AlertTitle>{saveMessages.offline}</AlertTitle>
          <AlertDescription>{saveMessages.offlineFormDetails}</AlertDescription>
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
            ? saveMessages.connectToSave
            : problem === 'unconfirmed'
              ? 'Try saving schedule again'
              : 'Save schedule'}
      </Button>
    </form>
  )
}

function SaveProblemAlert({ problem, label }: { problem: SaveProblem; label: string }) {
  const copy = {
    unconfirmed: {
      title: saveMessages.mightNotHaveSaved,
      body: `${label} is saved. Its schedule details are still here, and trying again saves them only once.`,
    },
    rejected: {
      title: "Schedule wasn't saved.",
      body: `${label} is saved without a schedule. Check the days, times and quantities, then save again.`,
    },
    conflict: { title: 'A schedule is already saved.', body: 'Open Medications to review it.' },
  }[problem]
  return (
    <Alert id="schedule-save-problem" variant="destructive">
      <AlertTitle>{copy.title}</AlertTitle>
      <AlertDescription>{copy.body}</AlertDescription>
    </Alert>
  )
}
