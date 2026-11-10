import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { formatShortDay } from '@/lib/calendar-date'
import { quantityLabel, type DoseUnit } from '@/lib/dose-quantity'
import { istanbulDate, type DailySchedule } from './contract'
import { endedOn } from './last-day'
import { weekdaySummary } from './weekdays'

/**
 * A schedule card's muted date lines: its first date line, then its Last day; an Ended schedule
 * shows only the day it ended (779·A13, A14, A17).
 */
export function ScheduleDateLines({
  started,
  lastDay,
  ended,
  today,
}: {
  started: string
  lastDay: string | null | undefined
  ended: string | null
  today: string
}) {
  if (ended)
    return (
      <p className="text-body-sm text-muted-foreground">Ended {formatShortDay(ended, today)}</p>
    )
  return (
    <>
      <p className="text-body-sm text-muted-foreground">{started}</p>
      {lastDay && (
        <p className="text-body-sm text-muted-foreground">
          Last day {formatShortDay(lastDay, today)}
        </p>
      )}
    </>
  )
}

/**
 * A medication's Clock schedule (647·D1): its days, each time with its quantity, and its start,
 * or, for a changed Schedule version, the day it changed, then its Last day or Ended day.
 */
export function ClockScheduleCard({
  schedule,
  unit,
  today,
}: {
  schedule: Pick<DailySchedule, 'weekdays' | 'times' | 'startDate'> &
    Partial<Pick<DailySchedule, 'basedOnId' | 'confirmedAt' | 'endDate' | 'stoppedAt'>>
  unit: DoseUnit
  today: string
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-baseline justify-between gap-2">
        <CardTitle>Schedule</CardTitle>
        <CardDescription>{weekdaySummary(schedule.weekdays, 'long')}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <ul className="divide-y">
          {schedule.times.map((slot) => (
            <li key={slot.time} className="flex flex-wrap justify-between gap-2 py-3">
              <span className="text-heading font-extrabold">{slot.time}</span>
              <span className="text-body-sm">{quantityLabel(slot.quantity, unit)}</span>
            </li>
          ))}
        </ul>
        <ScheduleDateLines
          started={
            schedule.basedOnId && schedule.confirmedAt
              ? `Changed ${formatShortDay(istanbulDate(new Date(schedule.confirmedAt)), today)}`
              : `${schedule.startDate > today ? 'Starts' : 'Started'} ${formatShortDay(schedule.startDate, today)}`
          }
          lastDay={schedule.endDate}
          ended={endedOn({ endDate: null, stoppedAt: null, ...schedule }, today)}
          today={today}
        />
      </CardContent>
    </Card>
  )
}
