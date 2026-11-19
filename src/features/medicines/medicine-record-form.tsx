'use client'

import { ChevronLeftIcon } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert'
import { DatePicker } from '@/components/ui/date-picker'
import { TimePicker } from '@/components/ui/time-picker'
import { Input } from '@/components/ui/input'
import { Field, FieldLabel, FieldDescription, FieldError, FieldGroup } from '@/components/ui/field'
import { DiscardMedicineChanges } from './discard-medicine-changes'
import { isWritableMedicineType } from '@/lib/quantity-policy'
import { useKnownOffline } from '@/lib/use-known-offline'
import { useSessionFormDraft } from '@/lib/use-session-form-draft'
import { saveMessages } from '@/lib/save-messages'
import { formatShortDay, formatTime } from '@/lib/calendar-date'
import { cn } from '@/lib/utils'
import { isTimeOfDay } from '@/lib/time-of-day'
import { isScheduleDate } from '../schedules/contract'
import { useSchedulingClock } from '../schedules/scheduling-clock'
import { useCurrentMinute } from '../schedules/use-current-minute'
import { instantOf } from '../schedules/taken-form-schema'
import { MedicationIdentity } from './medication-sub-screen'
import type { MedicineRecord } from './contract'
import { detailPeriodSentence } from './detail-period'
import { DetailCorrectionFields } from './detail-correction-fields'
import { medicineDetailsSchema } from './medicine-form-schema'
import { useMedicineRecordSave } from './use-medicine-record-save'

/** Fix one period, or explicitly start another. Raw drafts and attempts outlive this form;
 * changing bounds never resets dirty fields. Conflict review is an explicit fresh-read boundary.
 */
export function MedicineRecordForm({
  medicine,
  mode,
  periodId,
  onSaved,
  onCancel,
}: {
  medicine: MedicineRecord
  mode: 'fix' | 'strength'
  periodId: string
  onSaved: (medicine: MedicineRecord) => void
  onCancel: () => void
}) {
  const live = useRef(true)
  useEffect(() => {
    live.current = true
    return () => {
      live.current = false
    }
  }, [])
  const id = useId()
  const clock = useSchedulingClock()
  const now = useCurrentMinute(true)
  const offline = useKnownOffline()
  const strength = mode === 'strength'
  const period = medicine.strengthRevisions.find((r) => r.id === periodId)!
  const locked = medicine.everHadSchedule || medicine.everHadDose
  const save = useMedicineRecordSave(medicine, mode, periodId, onSaved)
  const schema = medicineDetailsSchema
    .extend({
      expectedRevision: z.number(),
      strength: strength
        ? z
            .string()
            .trim()
            .min(1, 'Enter the new strength.')
            .max(120, 'Use 120 characters or fewer.')
        : medicineDetailsSchema.shape.strength,
      date: z.string().refine((value) => !strength || isScheduleDate(value), 'Choose a date.'),
      time: z.string().refine((value) => !strength || isTimeOfDay(value), 'Choose a time.'),
    })
    .superRefine((values, context) => {
      if (!strength || !isScheduleDate(values.date) || !isTimeOfDay(values.time)) return
      const at = instantOf(`${values.date}T${values.time}`).getTime()
      if (at > clock.now().getTime())
        context.addIssue({
          code: 'custom',
          path: ['time'],
          message: 'Choose a time no later than now.',
        })
      if (medicine.latestTakenAt && at < Date.parse(medicine.latestTakenAt))
        context.addIssue({
          code: 'custom',
          path: ['time'],
          message: 'Choose a time no earlier than the latest dose recorded as Taken.',
        })
    })
  const defaults = {
    label: period.label,
    strength: strength ? '' : (period.strength ?? ''),
    // The menu lists only writable Types; any other Type starts unchosen.
    unit: isWritableMedicineType(period.unit) ? period.unit : ('' as const),
    expectedRevision: medicine.revision,
    date: '',
    time: '',
  }
  const form = useForm<z.input<typeof schema>, unknown, z.output<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: defaults,
  })
  const draft = useSessionFormDraft(save.key, form)
  const [discard, setDiscard] = useState(false)
  const [reviewing, setReviewing] = useState(false)
  const [reviewError, setReviewError] = useState(false)
  const problem = save.problem
  async function submit(values: z.output<typeof schema>) {
    await save.submit(
      strength
        ? {
            expectedRevision: values.expectedRevision,
            strength: values.strength,
            effectiveAt: instantOf(`${values.date}T${values.time}`).toISOString(),
            timeZone: 'Europe/Istanbul',
          }
        : {
            expectedRevision: values.expectedRevision,
            label: values.label,
            strength: values.strength,
            unit: locked ? period.unit : values.unit,
            strengthRevisionId: periodId,
          },
    )
  }
  useEffect(() => {
    if (!problem) return
    form.setError('root.server', { type: problem })
    if (strength && problem === 'rejected') {
      void form.trigger(['date', 'time']).then((valid) => {
        if (!valid) form.setFocus(form.getFieldState('date').invalid ? 'date' : 'time')
      })
    }
  }, [problem, strength, medicine.latestTakenAt, form])
  const dirty = form.formState.isDirty
  function cancel() {
    if (dirty || draft.restored) setDiscard(true)
    else onCancel()
  }
  async function review() {
    setReviewing(true)
    setReviewError(false)
    try {
      await save.review()
      if (live.current) onCancel()
    } catch {
      if (live.current) setReviewError(true)
    } finally {
      if (live.current) setReviewing(false)
    }
  }
  return (
    <>
      <Button
        variant="ghost"
        className="-ml-3 self-start"
        disabled={save.pending || reviewing}
        onClick={cancel}
      >
        <ChevronLeftIcon data-icon="inline-start" aria-hidden="true" />
        {medicine.label}
      </Button>
      <MedicationIdentity medicine={{ ...medicine, ...period, id: medicine.id }} />
      <div className="space-y-2">
        <h2 className="text-heading">{strength ? 'Change strength' : 'Edit details'}</h2>
        <p className="text-body-sm text-muted-foreground">
          {strength
            ? 'Keep earlier doses as they are. Choose when you started the new strength.'
            : `These changes also update doses recorded for this period. ${detailPeriodSentence(medicine, periodId, now.slice(0, 10))}`}
        </p>
      </div>
      <form
        noValidate
        className="flex flex-col gap-5 pb-5"
        aria-busy={save.pending}
        onSubmit={(event) => void form.handleSubmit(submit)(event)}
      >
        <fieldset disabled={save.pending || reviewing} className="flex min-w-0 flex-col gap-5">
          {draft.restored && (
            <p role="status" className="text-body-sm text-muted-foreground">
              {saveMessages.draftRestored}
            </p>
          )}
          {!strength ? (
            <DetailCorrectionFields
              control={form.control}
              period={period}
              locked={locked}
              disabled={save.pending || reviewing}
            />
          ) : (
            <FieldGroup>
              <Controller
                name="strength"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor={`${id}-strength`}>New strength</FieldLabel>
                    <Input
                      {...field}
                      id={`${id}-strength`}
                      autoComplete="off"
                      aria-invalid={fieldState.invalid}
                      aria-describedby={`${fieldState.invalid ? `${id}-strength-error ` : ''}${id}-strength-help`}
                    />
                    <FieldDescription id={`${id}-strength-help`}>
                      {`Currently ${medicine.strength ?? 'no strength entered'}. Enter the strength on the new pack.`}
                    </FieldDescription>
                    <FieldError id={`${id}-strength-error`} errors={[fieldState.error]} />
                  </Field>
                )}
              />
              <>
                <Controller
                  name="date"
                  control={form.control}
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                      <FieldLabel htmlFor={`${id}-date`}>Started on</FieldLabel>
                      <DatePicker
                        ref={field.ref}
                        id={`${id}-date`}
                        disabled={save.pending}
                        label="Started on"
                        value={field.value}
                        onValueChange={field.onChange}
                        onBlur={field.onBlur}
                        today={now.slice(0, 10)}
                        max={now.slice(0, 10)}
                        aria-invalid={fieldState.invalid}
                        aria-describedby={`${fieldState.invalid ? `${id}-date-error ` : ''}${id}-date-help`}
                      />
                      <FieldDescription id={`${id}-date-help`}>
                        Times are in Türkiye time. No later than now.
                        {medicine.latestTakenAt
                          ? ` No earlier than the latest dose recorded as Taken: ${formatShortDay(medicine.latestTakenAt, now.slice(0, 10))} at ${formatTime(medicine.latestTakenAt)}.`
                          : ' No doses recorded as Taken yet.'}
                      </FieldDescription>
                      <FieldError id={`${id}-date-error`} errors={[fieldState.error]} />
                    </Field>
                  )}
                />
                <Controller
                  name="time"
                  control={form.control}
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                      <FieldLabel htmlFor={`${id}-time`}>Started at</FieldLabel>
                      <TimePicker
                        ref={field.ref}
                        id={`${id}-time`}
                        disabled={save.pending}
                        label="Started at"
                        value={field.value}
                        onValueChange={field.onChange}
                        onBlur={field.onBlur}
                        now={clock.now}
                        aria-invalid={fieldState.invalid}
                        aria-describedby={fieldState.invalid ? `${id}-time-error` : undefined}
                      />
                      <FieldError id={`${id}-time-error`} errors={[fieldState.error]} />
                    </Field>
                  )}
                />
              </>
            </FieldGroup>
          )}
          {(offline || problem || reviewError) && (
            <Alert variant={offline ? 'default' : 'destructive'}>
              <AlertTitle>
                {offline
                  ? saveMessages.offline
                  : reviewError
                    ? 'Saved details didn’t load'
                    : problem === 'unconfirmed'
                      ? saveMessages.mightNotHaveSaved
                      : problem === 'conflict'
                        ? 'This medication changed elsewhere.'
                        : 'Your change wasn’t saved'}
              </AlertTitle>
              <AlertDescription>
                {offline
                  ? saveMessages.offlineFormDetails
                  : problem === 'conflict'
                    ? "Your changes weren't saved."
                    : 'Your details are still here. Check your connection and try again.'}
              </AlertDescription>
            </Alert>
          )}
          <div className={cn('flex flex-col', strength ? 'gap-5' : 'gap-2')}>
            {problem === 'conflict' ? (
              <Button type="button" size="lg" onClick={() => void review()}>
                Review saved medication
              </Button>
            ) : (
              <Button type="submit" size="lg" disabled={offline}>
                {save.pending
                  ? 'Saving...'
                  : offline
                    ? saveMessages.connectToSave
                    : problem === 'unconfirmed'
                      ? 'Retry save'
                      : strength
                        ? 'Save strength change'
                        : 'Save details'}
              </Button>
            )}
            <Button type="button" variant="ghost" onClick={cancel}>
              Cancel
            </Button>
          </div>
        </fieldset>
      </form>
      <DiscardMedicineChanges
        open={discard}
        onOpenChange={setDiscard}
        onDiscard={() => {
          draft.discard()
          save.clear()
          setDiscard(false)
          onCancel()
        }}
      />
    </>
  )
}
