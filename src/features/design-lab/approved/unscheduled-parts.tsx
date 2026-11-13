'use client'

import { useEffect, useId, useState } from 'react'
import Link from 'next/link'
import { CalendarOff, Plus, TriangleAlert } from 'lucide-react'
import { QuantityStepper } from '@/components/quantity-stepper'
import { Badge } from '@/components/ui/badge'
import { Button, buttonVariants } from '@/components/ui/button'
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
import { Item, ItemActions, ItemContent, ItemMedia, ItemTitle } from '@/components/ui/item'
import { TimePicker } from '@/components/ui/time-picker'
import { toast } from '@/components/ui/toast'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import type { Medicine } from '@/features/medicines/contract'
import { istanbulDate } from '@/features/schedules/contract'
import { DoseDrawer } from '@/features/schedules/dose-drawer'
import { DoseSaveProblem } from '@/features/schedules/dose-save-problem'
import { DoseStatusBadge } from '@/features/schedules/dose-status-badge'
import {
  previousDate,
  takenFormSchema,
  type TakenAtChoice,
} from '@/features/schedules/taken-form-schema'
import type { UnscheduledDose } from '@/features/unscheduled-doses/contract'
import { formatShortDay, formatTime } from '@/lib/calendar-date'
import { quantityLabel } from '@/lib/dose-quantity'
import type { DoseValues } from './unscheduled-model'

export type SaveStep = 'idle' | 'saving' | 'unknown' | 'rejected'

// A swipe that starts on a control never closes the drawer.
const swipeIgnore = { 'data-base-ui-swipe-ignore': 'y' }

/** "Log a dose" on Medication detail: an outline button under the schedule (241·A1, A2). */
export function LogDoseEntry({ href, id }: { href: string; id: string }) {
  return (
    <Link
      id={id}
      href={href}
      className={buttonVariants({ variant: 'outline', size: 'lg', className: 'w-full' })}
    >
      <Plus aria-hidden="true" data-icon="inline-start" />
      Log a dose
    </Link>
  )
}

/** The drawer's muted line in place of the Scheduled chip, with the save's live badge. */
export function NotOnScheduleChip({
  step,
  dose,
  today,
}: {
  step: SaveStep
  /** The saved dose a change drawer opened. */
  dose?: UnscheduledDose
  today: string
}) {
  const taken = dose ? istanbulDate(new Date(dose.takenAt)) : ''
  return (
    <Item variant="muted" size="sm" className="rounded-md bg-muted px-3.5 py-3">
      <ItemMedia className="text-muted-foreground [&>svg]:size-4.5">
        <CalendarOff aria-hidden="true" />
      </ItemMedia>
      <ItemContent>
        <ItemTitle className="text-body-sm font-bold text-muted-foreground">
          {dose ? (
            <span>
              Not on a schedule ·{' '}
              <time dateTime={dose.takenAt} className="font-extrabold text-foreground">
                {taken === today ? 'today' : formatShortDay(taken, today)}
              </time>
            </span>
          ) : (
            'Not on a schedule'
          )}
        </ItemTitle>
      </ItemContent>
      <ItemActions>
        {step === 'saving' ? (
          <Badge variant="pending">Saving · Taken</Badge>
        ) : step === 'unknown' ? (
          <Badge variant="unconfirmed">
            <TriangleAlert aria-hidden="true" />
            Might not have saved
          </Badge>
        ) : dose ? (
          <DoseStatusBadge
            status="Taken"
            time={<time dateTime={dose.takenAt}>{formatTime(dose.takenAt)}</time>}
          />
        ) : null}
      </ItemActions>
    </Item>
  )
}

/** Field errors from the production Taken rules: Now or another minute today or yesterday. */
function fieldErrors(values: DoseValues, medicine: Medicine, now: string) {
  const result = takenFormSchema({ unit: medicine.unit, now, scheduled: now }).safeParse(values)
  const errors: Partial<Record<keyof DoseValues, string>> = {}
  for (const issue of result.error?.issues ?? []) {
    const key = issue.path[0] as keyof DoseValues
    errors[key] ??= issue.message
  }
  return errors
}

/**
 * The Taken form's fields without a scheduled time: Taken at (Now or Other) and Amount, then the
 * production save problem and one primary action. Nothing saves in the lab.
 */
export function DoseFields({
  medicine,
  now,
  initial,
  validated = false,
  step,
  save,
  retry,
  onCancel,
  extra,
}: {
  medicine: Medicine
  /** Istanbul local minute, 'YYYY-MM-DDTHH:MM'. */
  now: string
  initial: DoseValues
  /** Shows the state after a Save. */
  validated?: boolean
  step: SaveStep
  save: string
  retry: string
  onCancel?: () => void
  /** Below Cancel, such as Remove dose. */
  extra?: React.ReactNode
}) {
  const id = useId()
  const [values, setValues] = useState(initial)
  const errors = validated ? fieldErrors(values, medicine, now) : {}
  const today = now.slice(0, 10)
  const saving = step === 'saving'
  const set = (patch: Partial<DoseValues>) => setValues((current) => ({ ...current, ...patch }))
  return (
    <form noValidate onSubmit={(event) => event.preventDefault()} aria-busy={saving}>
      <FieldSet disabled={saving} className="min-w-0 gap-4.5">
        <FieldLegend className="sr-only">What you took: {medicine.label}</FieldLegend>
        <FieldGroup className="gap-4.5">
          <Field className="gap-2.5">
            <FieldTitle id={`${id}-when`} className="font-extrabold">
              Taken at
            </FieldTitle>
            <ToggleGroup
              {...swipeIgnore}
              aria-labelledby={`${id}-when`}
              variant="outline"
              className="w-full flex-wrap"
              value={[values.when]}
              onValueChange={(value) => {
                const next = value[0] as TakenAtChoice | undefined
                if (!next) return
                set(
                  next === 'other' && !values.date
                    ? { when: next, date: today, time: now.slice(11) }
                    : { when: next },
                )
              }}
            >
              <ToggleGroupItem value="now" className="flex-1">
                Now · {now.slice(11)}
              </ToggleGroupItem>
              <ToggleGroupItem value="other" className="flex-1">
                Other
              </ToggleGroupItem>
            </ToggleGroup>
          </Field>
          {values.when === 'other' && (
            <div className="grid gap-3 min-[400px]:grid-cols-2">
              <Field data-invalid={Boolean(errors.date)} {...swipeIgnore}>
                <FieldLabel htmlFor={`${id}-date`}>Taken date</FieldLabel>
                <DatePicker
                  id={`${id}-date`}
                  label="Taken date in Istanbul"
                  today={today}
                  min={previousDate(today)}
                  max={today}
                  value={values.date}
                  onValueChange={(date) => set({ date })}
                  disabled={saving}
                  aria-invalid={Boolean(errors.date)}
                  aria-describedby={errors.date ? `${id}-date-error` : undefined}
                />
                <FieldError id={`${id}-date-error`} errors={[{ message: errors.date }]} />
              </Field>
              <Field data-invalid={Boolean(errors.time)} {...swipeIgnore}>
                <FieldLabel htmlFor={`${id}-time`}>Taken time</FieldLabel>
                <TimePicker
                  id={`${id}-time`}
                  label="Taken time in Istanbul"
                  value={values.time}
                  onValueChange={(time) => set({ time })}
                  disabled={saving}
                  aria-invalid={Boolean(errors.time)}
                  aria-describedby={errors.time ? `${id}-time-error` : undefined}
                />
                <FieldError id={`${id}-time-error`} errors={[{ message: errors.time }]} />
              </Field>
            </div>
          )}
          <Field
            data-invalid={Boolean(errors.quantity)}
            className="gap-2 rounded-lg border bg-card py-2 pr-2 pl-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <FieldLabel htmlFor={`${id}-quantity`} className="font-extrabold">
                Amount
              </FieldLabel>
              <div {...swipeIgnore}>
                <QuantityStepper
                  id={`${id}-quantity`}
                  label="Amount"
                  unit={medicine.unit}
                  value={values.quantity}
                  onValueChange={(quantity) => set({ quantity })}
                  disabled={saving}
                  aria-invalid={Boolean(errors.quantity)}
                  aria-describedby={errors.quantity ? `${id}-quantity-error` : undefined}
                />
              </div>
            </div>
            <FieldError id={`${id}-quantity-error`} errors={[{ message: errors.quantity }]} />
          </Field>
        </FieldGroup>
        {!saving && (
          <DoseSaveProblem
            id={`${id}-problem`}
            outcome="Taken"
            problem={
              step === 'unknown'
                ? { kind: 'uncertain', checked: false }
                : step === 'rejected'
                  ? { kind: 'rejected' }
                  : null
            }
            offline={false}
          />
        )}
        <div className="flex flex-col gap-1.5">
          <Button
            type="submit"
            size="drawer"
            className="w-full whitespace-normal"
            disabled={saving}
            aria-describedby={
              step === 'unknown' || step === 'rejected' ? `${id}-problem` : undefined
            }
          >
            {saving ? 'Saving...' : step === 'unknown' ? retry : save}
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

/** Remove dose's confirm step, in place of the drawer's form (#28: remove after a confirm step). */
export function RemoveConfirm({
  dose,
  medicine,
  today,
  step,
  onKeep,
}: {
  dose: UnscheduledDose
  medicine: Medicine
  today: string
  step: SaveStep
  onKeep?: () => void
}) {
  const taken = istanbulDate(new Date(dose.takenAt))
  const when = `${formatTime(dose.takenAt)}${taken === today ? '' : ` on ${formatShortDay(taken, today)}`}`
  const saving = step === 'saving'
  return (
    <div className="flex flex-col gap-4.5" aria-busy={saving}>
      <div className="flex flex-col gap-1.5">
        <p className="text-heading font-extrabold">Remove this dose?</p>
        <p className="text-body-sm text-muted-foreground">
          {quantityLabel(dose.quantity, medicine.unit)} at {when} leaves Today and History.
        </p>
      </div>
      {step === 'unknown' && (
        <DoseSaveProblem
          id="remove-problem"
          outcome="Skipped"
          problem={{ kind: 'uncertain', checked: false }}
          offline={false}
        />
      )}
      <div className="flex flex-col gap-1.5">
        <Button
          type="button"
          size="drawer"
          variant="destructive"
          className="w-full whitespace-normal"
          disabled={saving}
        >
          {saving ? 'Removing...' : step === 'unknown' ? 'Try removing again' : 'Remove dose'}
        </Button>
        <Button type="button" variant="ghost" className="w-full" disabled={saving} onClick={onKeep}>
          Keep dose
        </Button>
      </div>
    </div>
  )
}

/** The production dose drawer, held open for a lab frame. */
export function LabDoseDrawer({
  medicine,
  triggerId,
  saving,
  children,
}: {
  medicine: Medicine
  triggerId: string
  saving: boolean
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(true)
  return (
    <DoseDrawer
      open={open}
      saving={saving}
      triggerId={triggerId}
      medicineId={medicine.id}
      title={medicine.label}
      description={[medicine.strength, medicine.unit].filter(Boolean).join(' · ')}
      onClose={() => setOpen(false)}
    >
      {children}
    </DoseDrawer>
  )
}

/**
 * The save message: a Toast once the server has saved. Stays up for the capture. A
 * removal passes `type={null}`, so no check: a check means Taken.
 */
export function LabToast({ title, type = 'success' }: { title: string; type?: 'success' | null }) {
  useEffect(() => {
    const id = toast.add({ title, type: type ?? undefined, timeout: 0 })
    return () => toast.close(id)
  }, [title, type])
  return null
}

/** Row classes shared with Today's and History's dose rows. */
export const rowClassName =
  'grid grid-cols-[2.875rem_minmax(0,1fr)_auto] max-[360px]:grid-cols-[2.875rem_minmax(0,1fr)] has-[[data-row-trigger]:active]:scale-[0.98] has-[[data-row-trigger]:active]:bg-muted motion-reduce:has-[[data-row-trigger]:active]:scale-100'

/** Below 360px the badges move under the name, as on Today. */
export const badgeClassName =
  'max-w-full whitespace-normal max-[360px]:col-start-2 max-[360px]:justify-self-start'
