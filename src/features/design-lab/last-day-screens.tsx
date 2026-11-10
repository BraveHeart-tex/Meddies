'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { StickyActions } from '@/components/layout/sticky-actions'
import { Button } from '@/components/ui/button'
import { DatePicker } from '@/components/ui/date-picker'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import { NextDoses, ScheduleSetupHeader } from '@/features/schedules/interval-setup-parts'
import {
  ClockEditFields,
  EditFooter,
  IntervalEditRows,
  KindToggle,
  LabData,
  type SaveState,
} from './edit-lab-parts'
import {
  clockDoses,
  intervalDoses,
  type ClockValues,
  type IntervalValues,
  type ScheduleKind,
} from './edit-lab-model'
import { magnesium, NOW, TODAY } from './lab-fixtures'
import { lastDayProblem, type LastDaySchedule } from './last-day-model'
import { LastDayControl } from './last-day-parts'
import { useScheduleEdit } from './use-schedule-edit'

type SetupProps = {
  kind: ScheduleKind
  start?: string
  lastDay?: string | null
  interval?: IntervalValues
  /** Shown as after a first Save. */
  showErrors?: boolean
  sheet?: boolean
}

/** First-time setup (764·C0, C1) with the optional Last day. Nothing saves in the lab. */
export function LastDaySetup({
  kind,
  start = TODAY,
  lastDay: initialLastDay = null,
  interval,
  showErrors = false,
  sheet = false,
}: SetupProps) {
  const [lastDay, setLastDay] = useState(initialLastDay)
  const [startDate, setStartDate] = useState(start)
  const edit = useScheduleEdit(
    {
      kind: 'interval',
      interval: interval ?? { hours: '8', date: TODAY, time: '08:00', quantity: '1' },
    },
    { kind },
  )
  const anchorDate = kind === 'times' ? startDate : edit.interval.date
  const error = showErrors ? lastDayProblem(lastDay, anchorDate) : undefined
  const min = anchorDate > TODAY ? anchorDate : TODAY
  const control = (
    <LastDayControl
      kind={kind}
      value={lastDay}
      onChange={setLastDay}
      min={min}
      error={error}
      open={sheet}
    />
  )
  return (
    <LabData>
      <main className="mx-auto flex min-h-svh max-w-2xl flex-col px-5 pt-[calc(0.875rem+env(safe-area-inset-top,0px))]">
        <section
          aria-labelledby="schedule-heading"
          className="flex flex-1 flex-col gap-5 [overflow-wrap:anywhere]"
        >
          <ScheduleSetupHeader label={magnesium.label} onCancel={() => {}} />
          {kind === 'times' && (
            <p className="text-body-sm text-muted-foreground">
              Times are Istanbul time. Doses start from the next time after you save. Earlier times
              today aren&apos;t added.
            </p>
          )}
          <KindToggle value={kind} onChange={() => {}} />
          {kind === 'times' ? (
            <ClockEditFields
              value={{ weekdays: [0, 1, 2, 3, 4, 5, 6], times: [{ time: '20:00', quantity: '1' }] }}
              onChange={() => {}}
              afterDays={
                <>
                  <Field>
                    <FieldLabel htmlFor="schedule-start">Start date</FieldLabel>
                    <DatePicker
                      id="schedule-start"
                      label="Start date"
                      today={TODAY}
                      min={TODAY}
                      max="2099-12-31"
                      value={startDate}
                      onValueChange={setStartDate}
                    />
                    <FieldError />
                  </Field>
                  {control}
                </>
              }
            />
          ) : (
            <IntervalEditRows edit={edit} />
          )}
          {kind === 'interval' && control}
          {kind === 'interval' && (
            <NextDoses doses={intervalDoses(edit.interval)} lastDay={lastDay} today={TODAY} />
          )}
          <StickyActions>
            <Button type="button" size="lg" className="w-full whitespace-normal">
              Save schedule
            </Button>
          </StickyActions>
        </section>
      </main>
    </LabData>
  )
}

const valuesOf = (schedule: LastDaySchedule) =>
  schedule.kind === 'times' ? { clock: schedule.clock } : { interval: schedule.interval }

/** Change schedule (767·A2, A4) prefilled with the current Last day, which can move or go. */
export function LastDayChange({
  current,
  lastDay: initialLastDay = current.lastDay,
  clock,
  showErrors = false,
  state = 'idle',
  sheet = false,
  back,
}: {
  current: LastDaySchedule
  lastDay?: string | null
  /** Clock values edited before the frame. */
  clock?: ClockValues
  showErrors?: boolean
  state?: SaveState
  sheet?: boolean
  back: string
}) {
  const router = useRouter()
  const edit = useScheduleEdit(current, clock ? { clock } : valuesOf(current))
  const [lastDay, setLastDay] = useState(initialLastDay)
  const disabled = state !== 'idle'
  const error = showErrors ? lastDayProblem(lastDay) : undefined
  const control = (
    <LastDayControl
      kind={edit.kind}
      value={lastDay}
      onChange={setLastDay}
      min={TODAY}
      error={error}
      disabled={disabled}
      open={sheet}
    />
  )
  const doses = edit.kind === 'times' ? clockDoses(edit.clock) : intervalDoses(edit.interval)
  return (
    <LabData>
      <main className="mx-auto flex min-h-svh max-w-2xl flex-col px-5 pt-[calc(0.875rem+env(safe-area-inset-top,0px))]">
        <section
          aria-labelledby="schedule-heading"
          aria-busy={state === 'saving'}
          className="flex flex-1 flex-col gap-5 [overflow-wrap:anywhere]"
        >
          <ScheduleSetupHeader
            label={magnesium.label}
            subtitle="Change schedule"
            onCancel={() => router.push(back)}
          />
          <KindToggle value={edit.kind} onChange={edit.setKind} disabled={disabled} />
          {edit.kind === 'times' ? (
            <ClockEditFields
              value={edit.clock}
              onChange={edit.setClock}
              disabled={disabled}
              afterDays={control}
            />
          ) : (
            <IntervalEditRows edit={edit} disabled={disabled} />
          )}
          {edit.kind === 'interval' && control}
          <NextDoses doses={doses} lastDay={lastDay} today={TODAY} after={NOW} />
          <StickyActions>
            <EditFooter
              changed={edit.changed || lastDay !== current.lastDay}
              state={state}
              onReview={() => router.push(back)}
            />
          </StickyActions>
        </section>
      </main>
    </LabData>
  )
}
