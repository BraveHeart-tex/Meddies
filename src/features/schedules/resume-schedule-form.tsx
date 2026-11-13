'use client'

import { useEffect, useRef, useState } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { InfoIcon } from 'lucide-react'
import { StickyActions } from '@/components/layout/sticky-actions'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { formatShortDay } from '@/lib/calendar-date'
import { quantityLabel, type DoseUnit } from '@/lib/dose-quantity'
import { saveMessages } from '@/lib/save-messages'
import type { SaveProblem } from '@/lib/session-saves'
import { isTimeOfDay } from '@/lib/time-of-day'
import { useSessionFormDraft } from '@/lib/use-session-form-draft'
import type { DailySchedule } from './contract'
import { IntervalFirstDateField, IntervalFirstTimeField } from './interval-fields'
import {
  IntervalRow,
  IntervalSheet,
  intervalStartsAnswer,
  NextDoses,
  ScheduleSetupHeader,
} from './interval-setup-parts'
import { resumeDefaults, resumeDoses, resumeFormSchema, type ResumeValues } from './resume'

const PROBLEM_ID = 'resume-save-problem'

/**
 * Interval resume (233·A9 to A13, S5): a full screen like Change schedule with the Starts row and
 * its sheet (215·A4), the next 3 doses cut at the Last day, and Resume schedule pinned to the
 * bottom. Holds values only; the screen around it owns the save.
 */
export function ResumeScheduleForm({
  label,
  unit,
  schedule,
  today,
  now,
  draftKey,
  pending,
  problem,
  offline,
  initialValues,
  validateOnOpen = false,
  onSubmit,
  onCancel,
  onReview,
}: {
  label: string
  unit: DoseUnit
  schedule: Pick<DailySchedule, 'intervalHours' | 'times' | 'endDate'>
  /** Istanbul today on the scheduling clock. */
  today: string
  /** The live time the preview counts from. */
  now: string
  /** Null keeps no session draft. */
  draftKey: string | null
  pending: boolean
  problem?: SaveProblem
  offline: boolean
  initialValues?: ResumeValues
  /** Opens as after a Save, errors shown (the lab's 233·A11). */
  validateOnOpen?: boolean
  onSubmit: (values: ResumeValues) => void
  onCancel: () => void
  /** Leaves a stale resume for the current schedule (215·S2). */
  onReview: () => void
}) {
  const lastDay = schedule.endDate ?? null
  const hours = schedule.intervalHours ?? 1
  const [defaults] = useState(() => resumeDefaults(today))
  const form = useForm<ResumeValues>({
    resolver: zodResolver(resumeFormSchema({ today, lastDay })),
    defaultValues: initialValues ?? defaults,
    // The fields live in a closed sheet, so a failed save focuses the Starts row instead.
    shouldFocusError: false,
  })
  const { errors, isSubmitted } = form.formState
  const draft = useSessionFormDraft(draftKey, form)
  const [date, time] = useWatch({ control: form.control, name: ['date', 'time'] })
  const [sheet, setSheet] = useState(false)
  const beforeSheet = useRef(form.getValues())
  const startsRow = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (validateOnOpen) void form.handleSubmit(() => {})()
  }, [form, validateOnOpen])

  function cancelSheet() {
    form.setValue('date', beforeSheet.current.date)
    form.setValue('time', beforeSheet.current.time)
    if (isSubmitted) void form.trigger(['date', 'time'])
    else form.clearErrors(['date', 'time'])
    setSheet(false)
  }

  async function doneSheet() {
    if (await form.trigger(['date', 'time'], { shouldFocus: true })) setSheet(false)
  }

  /** Before a save an error stays until its field changes; after one RHF revalidates it. */
  const onFieldChange =
    (name: keyof ResumeValues, onChange: (value: string) => void) => (value: string) => {
      form.clearErrors(name)
      onChange(value)
    }

  const quantity = quantityLabel(schedule.times[0].quantity, unit)
  const stale = problem === 'conflict' || problem === 'rejected'
  return (
    <>
      <ScheduleSetupHeader label={label} subtitle="Resume schedule" onCancel={onCancel} />
      <form
        noValidate
        aria-busy={pending}
        aria-labelledby="schedule-heading"
        className="flex flex-1 flex-col gap-5"
        onSubmit={(event) =>
          void form.handleSubmit(onSubmit, () => startsRow.current?.focus())(event)
        }
      >
        <p className="text-body-sm text-muted-foreground">
          {hours === 1 ? 'Every hour' : `Every ${hours} hours`}, {quantity} each time.
          {lastDay && ` Last day ${formatShortDay(lastDay, today)}.`} Choose when doses start again.
        </p>
        {draft.restored && (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-body-sm text-muted-foreground">{saveMessages.draftRestored}</p>
            <Button
              type="button"
              variant="ghost"
              disabled={pending}
              onClick={() => {
                form.reset(defaults)
                draft.discard()
              }}
            >
              Clear form
            </Button>
          </div>
        )}
        <ul className="divide-y rounded-xl border bg-card">
          <IntervalRow
            ref={startsRow}
            id="resume-starts-row"
            label="Starts"
            value={isTimeOfDay(time) ? intervalStartsAnswer(date, time, today) : null}
            error={errors.date?.message ?? errors.time?.message}
            disabled={pending}
            onClick={() => {
              beforeSheet.current = form.getValues()
              setSheet(true)
            }}
          />
        </ul>
        <NextDoses
          doses={resumeDoses({ date, time }, hours, now)}
          hours={hours}
          lastDay={lastDay}
          today={today}
        />
        <StickyActions>
          {stale ? (
            <>
              <Alert id={PROBLEM_ID} variant="destructive">
                <AlertTitle>This schedule changed while you were editing.</AlertTitle>
                <AlertDescription>
                  Nothing here was saved. Review the current schedule, then make your change again.
                </AlertDescription>
              </Alert>
              <Button
                type="button"
                size="lg"
                className="w-full whitespace-normal"
                onClick={onReview}
              >
                Review current schedule
              </Button>
            </>
          ) : (
            <>
              {offline && !pending ? (
                <Alert id={PROBLEM_ID}>
                  <InfoIcon aria-hidden="true" />
                  <AlertTitle>{saveMessages.offline}</AlertTitle>
                </Alert>
              ) : (
                problem === 'unconfirmed' && (
                  <Alert id={PROBLEM_ID} variant="destructive">
                    <AlertDescription>
                      That might not have saved. Check your connection and try again.
                    </AlertDescription>
                  </Alert>
                )
              )}
              <Button
                type="submit"
                size="lg"
                disabled={pending || offline}
                className="w-full whitespace-normal"
                aria-describedby={problem || offline ? PROBLEM_ID : undefined}
              >
                {pending
                  ? 'Resuming…'
                  : offline
                    ? saveMessages.connectToSave
                    : problem === 'unconfirmed'
                      ? 'Retry'
                      : 'Resume schedule'}
              </Button>
            </>
          )}
        </StickyActions>
        <IntervalSheet
          open={sheet}
          title="Starts"
          onCancel={cancelSheet}
          onDone={() => void doneSheet()}
        >
          <Controller
            name="date"
            control={form.control}
            render={({ field, fieldState }) => (
              <IntervalFirstDateField
                inputRef={field.ref}
                today={today}
                max={lastDay ?? undefined}
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
        </IntervalSheet>
      </form>
    </>
  )
}
