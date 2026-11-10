'use client'

import { useEffect, useRef, useState } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Button } from '@/components/ui/button'
import { quantityLabel, parseQuantity, quantityProblem, quantityRule } from '@/lib/dose-quantity'
import { saveMessages } from '@/lib/save-messages'
import { isTimeOfDay } from '@/lib/time-of-day'
import { useKnownOffline } from '@/lib/use-known-offline'
import { useSessionFormDraft } from '@/lib/use-session-form-draft'
import type { Medicine } from '@/features/medicines/contract'
import { istanbulDate, type DailySchedule } from './contract'
import {
  IntervalFirstDateField,
  IntervalFirstTimeField,
  IntervalHoursField,
  IntervalQuantityField,
} from './interval-fields'
import {
  intervalChangeDefaults,
  intervalFormDefaults,
  intervalFormSchema,
  intervalValuesDiffer,
  type IntervalFormOutput,
  type IntervalFormValues,
} from './interval-form-schema'
import { intervalAnchor, nextIntervalDoses } from './interval-preview'
import {
  intervalHoursAnswer,
  NextDoses,
  IntervalRow,
  IntervalSheet,
  intervalStartsAnswer,
} from './interval-setup-parts'
import { earliestLastDay } from './last-day'
import { LastDayRow } from './last-day-controls'
import { ScheduleSaveFooter } from './schedule-save-footer'
import type { ScheduleChange } from './schedule-form'
import { intervalDraftKey, scheduleDraftBase } from './schedule-setup-drafts'
import { useScheduleNow } from './use-schedule-now'
import { useScheduleSave } from './use-schedule-save'

type Sheet = 'every' | 'starts' | 'take'
type FieldName = keyof IntervalFormValues

const SHEET_TITLES: Record<Sheet, string> = { every: 'Every', starts: 'Starts', take: 'Take' }
const SHEET_FIELDS: Record<Sheet, FieldName[]> = {
  every: ['hours'],
  starts: ['date', 'time'],
  take: ['quantity'],
}

/**
 * An Interval schedule for one saved medicine (764·C1 to C16): three answers, each edited alone
 * in a sheet, and the doses they produce. Saves through the same attempt as a Clock schedule. A
 * `change` opens on the current Schedule version and keeps its Anchor unless Starts changes
 * (767·A4 to A8).
 */
export function IntervalScheduleForm({
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
  const { retryStartDate, problem } = saveState
  const [defaults] = useState(() =>
    current ? intervalChangeDefaults(current, today) : intervalFormDefaults(medicine.unit, today),
  )
  const schema = intervalFormSchema({ unit: medicine.unit, today, retryStartDate, current })
  const form = useForm<IntervalFormValues, unknown, IntervalFormOutput>({
    resolver: zodResolver(schema),
    defaultValues: defaults,
    // Fields live in closed sheets, so a failed save focuses its row instead.
    shouldFocusError: false,
  })
  const { errors, isSubmitted } = form.formState
  const draft = useSessionFormDraft(intervalDraftKey(scheduleDraftBase(medicine.id, current)), form)
  const offline = useKnownOffline()
  const now = useScheduleNow(serverNow)
  const [hours, date, time, quantity, lastDay] = useWatch({
    control: form.control,
    name: ['hours', 'date', 'time', 'quantity', 'lastDay'],
  })
  const [sheet, setSheet] = useState<Sheet | null>(null)
  // Keeps the sheet's content in place while it animates closed.
  const [lastSheet, setLastSheet] = useState<Sheet>('every')
  const beforeSheet = useRef(defaults)
  const everyRow = useRef<HTMLButtonElement>(null)
  const startsRow = useRef<HTMLButtonElement>(null)
  const takeRow = useRef<HTMLButtonElement>(null)
  const lastDayRow = useRef<HTMLButtonElement>(null)

  function saved(schedule: DailySchedule) {
    form.reset(defaults)
    draft.dismissRestoreNotice()
    onSaved(schedule)
  }

  useEffect(() => {
    // A change shows its own conflict recovery (767·S2).
    if (problem === 'conflict' && !current) onConflict()
  }, [problem, onConflict, current])

  function openSheet(next: Sheet) {
    beforeSheet.current = form.getValues()
    setLastSheet(next)
    setSheet(next)
  }

  function cancelSheet() {
    const names = SHEET_FIELDS[lastSheet]
    for (const name of names) form.setValue(name, beforeSheet.current[name])
    if (isSubmitted) void form.trigger(names)
    else form.clearErrors(names)
    setSheet(null)
  }

  async function doneSheet() {
    if (await form.trigger(SHEET_FIELDS[lastSheet], { shouldFocus: true })) setSheet(null)
  }

  function focusFirstInvalidRow(invalid: typeof errors) {
    if (invalid.hours) everyRow.current?.focus()
    else if (invalid.date || invalid.time) startsRow.current?.focus()
    else if (invalid.quantity) takeRow.current?.focus()
    else if (invalid.lastDay) lastDayRow.current?.focus()
  }

  /** Before a save an error stays until its field changes; after one RHF revalidates it. */
  function onFieldChange<V>(name: FieldName, onChange: (value: V) => void) {
    return (value: V) => {
      form.clearErrors(name)
      onChange(value)
    }
  }

  const isSubmitting = saveState.pending
  const keptDate = current?.intervalHours != null ? current.startDate : undefined
  const minDate = [retryStartDate, keptDate].reduce<string>(
    (earliest, date) => (date && date < earliest ? date : earliest),
    today,
  )
  // Quantity doesn't move the doses, so a half-typed one can't blank the preview.
  const timing = schema.safeParse({
    hours,
    date,
    time,
    quantity: quantityRule(medicine.unit).initial,
    lastDay: null,
  })
  const doses = timing.success
    ? nextIntervalDoses({
        anchor: intervalAnchor(timing.data),
        hours: timing.data.intervalHours,
        now,
      })
    : null
  const quantityValue = quantityProblem(quantity, medicine.unit) ? null : parseQuantity(quantity)

  return (
    <form
      noValidate
      onSubmit={(event) => void form.handleSubmit(saveState.submit, focusFirstInvalidRow)(event)}
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
                  ? intervalChangeDefaults(current, today)
                  : intervalFormDefaults(medicine.unit, today),
              )
              draft.discard()
            }}
          >
            Clear form
          </Button>
        </div>
      )}
      <ul className="divide-y rounded-xl border bg-card">
        <IntervalRow
          ref={everyRow}
          id="interval-every-row"
          label="Every"
          value={intervalHoursAnswer(hours)}
          error={errors.hours?.message}
          disabled={isSubmitting}
          onClick={() => openSheet('every')}
        />
        <IntervalRow
          ref={startsRow}
          id="interval-starts-row"
          label="Starts"
          value={isTimeOfDay(time) ? intervalStartsAnswer(date, time, today) : null}
          error={errors.date?.message ?? errors.time?.message}
          disabled={isSubmitting}
          onClick={() => openSheet('starts')}
        />
        <IntervalRow
          ref={takeRow}
          id="interval-take-row"
          label="Take"
          value={quantityValue === null ? null : quantityLabel(quantityValue, medicine.unit)}
          error={errors.quantity?.message}
          disabled={isSubmitting}
          onClick={() => openSheet('take')}
        />
      </ul>
      <Controller
        name="lastDay"
        control={form.control}
        render={({ field, fieldState }) => (
          <LastDayRow
            rowRef={lastDayRow}
            value={field.value}
            onChange={onFieldChange('lastDay', field.onChange)}
            today={today}
            min={earliestLastDay(today, date)}
            error={fieldState.error?.message}
            disabled={isSubmitting}
          />
        )}
      />
      <NextDoses
        doses={doses}
        lastDay={lastDay}
        // The approved change preview has no overnight note (767·A5).
        hours={current || !timing.success ? undefined : timing.data.intervalHours}
        today={istanbulDate(new Date(now))}
        after={current ? now : undefined}
      />
      <ScheduleSaveFooter
        problem={problem}
        offline={offline}
        isSubmitting={isSubmitting}
        label={medicine.label}
        checkHint="Check the hours, first time and quantity, then save again."
        change={
          change && {
            // Saving a stopped schedule restarts it, unchanged or not (FE-785).
            changed:
              Boolean(current?.stoppedAt) ||
              current?.intervalHours == null ||
              intervalValuesDiffer({ hours, date, time, quantity, lastDay }, defaults),
            onReview: change.onReview,
          }
        }
      />
      <IntervalSheet
        open={sheet !== null}
        title={SHEET_TITLES[lastSheet]}
        onCancel={cancelSheet}
        onDone={() => void doneSheet()}
      >
        {lastSheet === 'every' && (
          <>
            <Controller
              name="hours"
              control={form.control}
              render={({ field, fieldState }) => (
                <IntervalHoursField
                  inputRef={field.ref}
                  value={field.value}
                  error={fieldState.error?.message}
                  onChange={onFieldChange('hours', field.onChange)}
                  onBlur={field.onBlur}
                />
              )}
            />
            <p className="text-center text-body-sm text-muted-foreground">
              A late dose doesn&apos;t move later times.
            </p>
          </>
        )}
        {lastSheet === 'starts' && (
          <>
            <Controller
              name="date"
              control={form.control}
              render={({ field, fieldState }) => (
                <IntervalFirstDateField
                  inputRef={field.ref}
                  today={today}
                  min={minDate}
                  value={field.value}
                  error={fieldState.error?.message}
                  onChange={onFieldChange('date', field.onChange)}
                  onBlur={field.onBlur}
                />
              )}
            />
            <Controller
              name="time"
              control={form.control}
              render={({ field, fieldState }) => (
                <IntervalFirstTimeField
                  inputRef={field.ref}
                  value={field.value}
                  error={fieldState.error?.message}
                  onChange={onFieldChange('time', field.onChange)}
                  onBlur={field.onBlur}
                />
              )}
            />
          </>
        )}
        {lastSheet === 'take' && (
          <Controller
            name="quantity"
            control={form.control}
            render={({ field, fieldState }) => (
              <IntervalQuantityField
                inputRef={field.ref}
                unit={medicine.unit}
                value={field.value}
                error={fieldState.error?.message}
                onChange={onFieldChange('quantity', field.onChange)}
                onBlur={field.onBlur}
              />
            )}
          />
        )}
      </IntervalSheet>
    </form>
  )
}
