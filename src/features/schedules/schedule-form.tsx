'use client'

import { Plus } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Controller, useFieldArray, useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
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
import { isTimeOfDay } from '@/lib/time-of-day'
import { istanbulDate, type DailySchedule } from './contract'
import { saveMessages } from '@/lib/save-messages'
import { nextClockDoses } from './clock-preview'
import { NextDoses } from './interval-setup-parts'
import { ScheduleSaveFooter } from './schedule-save-footer'
import { scheduleDraftBase } from './schedule-setup-drafts'
import { useScheduleNow } from './use-schedule-now'
import { useScheduleSave } from './use-schedule-save'
import {
  clockValuesDiffer,
  newTimeRow,
  scheduleChangeDefaults,
  scheduleFormDefaults,
  scheduleFormSchema,
  type ScheduleFormOutput,
  type ScheduleFormValues,
} from './schedule-form-schema'
import { ScheduleTimeRow } from './schedule-time-row'
import { SHORT_WEEKDAYS, WEEK_ORDER, WEEKDAY_NAMES, weekdaySummary } from './weekdays'

const MAX_TIMES = 24

/** A change to the current Schedule version, instead of a first schedule (FE-769). */
export type ScheduleChange = {
  current: DailySchedule
  /** Leaves for the current Schedule version after another save got there first. */
  onReview: () => void
}

/**
 * First schedule for one saved medicine (FE-647 A7 to A9, S1 to S4; FE-650 D22), or a `change`
 * to its current Schedule version without a Start date (767·A2, A3, A9). Values stay in session
 * memory; `onSaved` runs only after the server confirms, and `onConflict` when first setup finds
 * the medicine already has a schedule.
 */
export function ScheduleForm({
  medicine,
  today,
  serverNow,
  onSaved,
  onConflict,
  change,
}: {
  medicine: Medicine
  /** Istanbul today from the scheduling clock. */
  today: string
  serverNow: string
  onSaved: (schedule: DailySchedule) => void
  onConflict: () => void
  change?: ScheduleChange
}) {
  const current = change?.current
  const saveState = useScheduleSave(medicine, saved, current)
  const retryStartDate = saveState.retryStartDate
  const [defaults] = useState(() =>
    current ? scheduleChangeDefaults(current, today) : scheduleFormDefaults(medicine.unit, today),
  )
  const form = useForm<ScheduleFormValues, unknown, ScheduleFormOutput>({
    resolver: zodResolver(
      scheduleFormSchema({ unit: medicine.unit, today, retryStartDate, current }),
    ),
    defaultValues: defaults,
  })
  const rows = useFieldArray({ control: form.control, name: 'times' })
  const [weekdays, times] = useWatch({ control: form.control, name: ['weekdays', 'times'] })
  const draft = useSessionFormDraft(scheduleDraftBase(medicine.id, current), form)
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
    // A change shows its own conflict recovery (767·S2).
    if (saveState.problem === 'conflict' && !current) onConflict()
  }, [saveState.problem, onConflict, current])

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
      className="flex flex-1 flex-col gap-5"
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
              form.reset(
                current
                  ? scheduleChangeDefaults(current, today)
                  : scheduleFormDefaults(medicine.unit, today),
              )
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
          {!current && (
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
          )}
          <FieldDescription id="quantity-help">
            Quantity is how much you take each time, not the strength on the pack.
          </FieldDescription>
          {rows.fields.map((row, index) => (
            <ScheduleTimeRow
              key={row.id}
              control={form.control}
              index={index}
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
      {current && (
        <ClockChangePreview
          weekdays={weekdays}
          times={times.map((slot) => slot.time)}
          serverNow={serverNow}
        />
      )}
      <ScheduleSaveFooter
        problem={problem}
        offline={offline}
        isSubmitting={isSubmitting}
        label={medicine.label}
        checkHint="Check the days, times and quantities, then save again."
        change={
          change && {
            changed:
              current?.intervalHours != null ||
              clockValuesDiffer({ ...defaults, weekdays, times }, defaults),
            onReview: change.onReview,
          }
        }
      />
    </form>
  )
}

/** The next 3 doses of the edited Clock schedule after the live time (767·A3). */
function ClockChangePreview({
  weekdays,
  times,
  serverNow,
}: {
  weekdays: number[]
  times: string[]
  serverNow: string
}) {
  const now = useScheduleNow(serverNow)
  const chosen = [...new Set(times.filter(isTimeOfDay))]
  const doses =
    weekdays.length && chosen.length ? nextClockDoses({ weekdays, times: chosen, now }) : null
  return <NextDoses doses={doses} today={istanbulDate(new Date(now))} after={now} />
}
