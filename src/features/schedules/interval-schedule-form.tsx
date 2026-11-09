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
  intervalFormDefaults,
  intervalFormSchema,
  type IntervalFormOutput,
  type IntervalFormValues,
} from './interval-form-schema'
import { intervalAnchor, nextIntervalDoses } from './interval-preview'
import {
  intervalHoursAnswer,
  IntervalNextDoses,
  IntervalRow,
  IntervalSheet,
  intervalStartsAnswer,
} from './interval-setup-parts'
import { ScheduleSaveFooter } from './schedule-save-footer'
import { intervalSetupKey } from './schedule-setup-drafts'
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
 * in a sheet, and the doses they produce. Saves through the same attempt as a Clock schedule.
 */
export function IntervalScheduleForm({
  medicine,
  today,
  serverNow,
  onSaved,
  onConflict,
}: {
  medicine: Medicine
  /** Istanbul today from the scheduling clock. */
  today: string
  serverNow: string
  onSaved: (schedule: DailySchedule) => void
  onConflict: () => void
}) {
  const saveState = useScheduleSave(medicine, saved)
  const { retryStartDate, problem } = saveState
  const [defaults] = useState(() => intervalFormDefaults(medicine.unit, today))
  const schema = intervalFormSchema({ unit: medicine.unit, today, retryStartDate })
  const form = useForm<IntervalFormValues, unknown, IntervalFormOutput>({
    resolver: zodResolver(schema),
    defaultValues: defaults,
    // Fields live in closed sheets, so a failed save focuses its row instead.
    shouldFocusError: false,
  })
  const { errors, isSubmitted } = form.formState
  const draft = useSessionFormDraft(intervalSetupKey(medicine.id), form)
  const offline = useKnownOffline()
  const now = useScheduleNow(serverNow)
  const [hours, date, time, quantity] = useWatch({
    control: form.control,
    name: ['hours', 'date', 'time', 'quantity'],
  })
  const [sheet, setSheet] = useState<Sheet | null>(null)
  // Keeps the sheet's content in place while it animates closed.
  const [lastSheet, setLastSheet] = useState<Sheet>('every')
  const beforeSheet = useRef(defaults)
  const everyRow = useRef<HTMLButtonElement>(null)
  const startsRow = useRef<HTMLButtonElement>(null)
  const takeRow = useRef<HTMLButtonElement>(null)

  function saved(schedule: DailySchedule) {
    form.reset(defaults)
    draft.dismissRestoreNotice()
    onSaved(schedule)
  }

  useEffect(() => {
    if (problem === 'conflict') onConflict()
  }, [problem, onConflict])

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
  }

  /** Before a save an error stays until its field changes; after one RHF revalidates it. */
  function change(name: FieldName, onChange: (value: string) => void) {
    return (value: string) => {
      form.clearErrors(name)
      onChange(value)
    }
  }

  const isSubmitting = saveState.pending
  const minDate = retryStartDate && retryStartDate < today ? retryStartDate : today
  // Quantity doesn't move the doses, so a half-typed one can't blank the preview.
  const timing = schema.safeParse({
    hours,
    date,
    time,
    quantity: quantityRule(medicine.unit).initial,
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
              form.reset(intervalFormDefaults(medicine.unit, today))
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
      <IntervalNextDoses
        doses={doses}
        hours={timing.success ? timing.data.intervalHours : 1}
        today={istanbulDate(new Date(now))}
      />
      <div className="mt-auto flex flex-col gap-5">
        <ScheduleSaveFooter
          problem={problem}
          offline={offline}
          isSubmitting={isSubmitting}
          label={medicine.label}
          checkHint="Check the hours, first time and quantity, then save again."
        />
      </div>
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
                  onChange={change('hours', field.onChange)}
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
                  onChange={change('date', field.onChange)}
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
                  onChange={change('time', field.onChange)}
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
                onChange={change('quantity', field.onChange)}
                onBlur={field.onBlur}
              />
            )}
          />
        )}
      </IntervalSheet>
    </form>
  )
}
