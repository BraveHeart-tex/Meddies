import type { ReactNode } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { IntervalDoseList } from '@/features/schedules/interval-dose-list'
import { intervalLabel } from '@/features/schedules/interval-preview'
import { weekdaySummary } from '@/features/schedules/weekdays'
import { quantityLabel } from '@/lib/dose-quantity'
import { magnesium, TODAY } from './lab-fixtures'
import type { ClockValues, IntervalValues } from './edit-lab-model'
import { shortDay } from './last-day-model'

export type CardState =
  { status: 'running'; lastDay: string | null } | { status: 'ended'; endedOn: string }

/** Started, then Last day, as plain footer lines; an Ended schedule shows only its Ended day. */
function DateLines({ started, state }: { started: string; state: CardState }) {
  if (state.status === 'ended')
    return <p className="text-body-sm text-muted-foreground">Ended {shortDay(state.endedOn)}</p>
  return (
    <>
      <p className="text-body-sm text-muted-foreground">{started}</p>
      {state.lastDay && (
        <p className="text-body-sm text-muted-foreground">Last day {shortDay(state.lastDay)}</p>
      )}
    </>
  )
}

/** Medication detail's Clock schedule card (647·D1) with its Last day or Ended footer. */
export function LastDayClockCard({
  clock,
  started,
  state,
  actions,
}: {
  clock: ClockValues
  started: string
  state: CardState
  actions?: ReactNode
}) {
  const times = [...clock.times].sort((a, b) => a.time.localeCompare(b.time))
  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-baseline justify-between gap-2">
        <CardTitle>Schedule</CardTitle>
        <CardDescription>{weekdaySummary(clock.weekdays, 'long')}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <ul className="divide-y">
          {times.map((slot) => (
            <li key={slot.time} className="flex flex-wrap justify-between gap-2 py-3">
              <span className="text-heading font-extrabold">{slot.time}</span>
              <span className="text-body-sm">
                {quantityLabel(Number(slot.quantity), magnesium.unit)}
              </span>
            </li>
          ))}
        </ul>
        <DateLines started={started} state={state} />
        {actions}
      </CardContent>
    </Card>
  )
}

/** Medication detail's Interval schedule card (764·D1); an Ended one lists no next doses. */
export function LastDayIntervalCard({
  interval,
  doses,
  started,
  state,
  actions,
}: {
  interval: IntervalValues
  doses: string[]
  started: string
  state: CardState
  actions?: ReactNode
}) {
  const ended = state.status === 'ended'
  const lastDay = state.status === 'running' ? state.lastDay : null
  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-baseline justify-between gap-2">
        <CardTitle>Schedule</CardTitle>
        <CardDescription>{intervalLabel(Number(interval.hours))}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {!ended && (
          <>
            <h3 className="text-body-sm font-extrabold">
              {!lastDay || doses.length === 3 ? 'Next 3 doses' : `Next ${doses.length} doses`}
            </h3>
            <IntervalDoseList doses={doses} today={TODAY} />
          </>
        )}
        <p className="text-body-sm">
          {quantityLabel(Number(interval.quantity), magnesium.unit)} each time
        </p>
        <DateLines started={started} state={state} />
        {actions}
      </CardContent>
    </Card>
  )
}
