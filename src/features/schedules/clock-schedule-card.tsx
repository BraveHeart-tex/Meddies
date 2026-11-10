import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { formatShortDay } from '@/lib/calendar-date'
import { quantityLabel, type DoseUnit } from '@/lib/dose-quantity'
import type { DailySchedule } from './contract'
import { weekdaySummary } from './weekdays'

/** A medication's Clock schedule (647·D1): its days, each time with its quantity, and its start. */
export function ClockScheduleCard({
  schedule,
  unit,
  today,
}: {
  schedule: Pick<DailySchedule, 'weekdays' | 'times' | 'startDate'>
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
        <p className="text-body-sm text-muted-foreground">
          {schedule.startDate > today ? 'Starts' : 'Started'}{' '}
          {formatShortDay(schedule.startDate, today)}
        </p>
      </CardContent>
    </Card>
  )
}
