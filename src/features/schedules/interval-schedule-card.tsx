import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { formatShortDay, formatTime } from '@/lib/calendar-date'
import { quantityLabel, type DoseUnit } from '@/lib/dose-quantity'
import { istanbulDate } from './contract'
import { IntervalDoseList } from './interval-dose-list'
import { intervalLabel, nextIntervalDoses } from './interval-preview'

/** A medication's Interval schedule (764·D1, D2). */
export function IntervalScheduleCard({
  hours,
  anchor,
  quantity,
  unit,
  now,
}: {
  hours: number
  anchor: string
  quantity: number
  unit: DoseUnit
  now: string
}) {
  const today = istanbulDate(new Date(now))
  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-baseline justify-between gap-2">
        <CardTitle>Schedule</CardTitle>
        <CardDescription>{intervalLabel(hours)}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <h3 className="text-body-sm font-extrabold">Next 3 doses</h3>
        <IntervalDoseList doses={nextIntervalDoses({ anchor, hours, now })} today={today} />
        <p className="text-body-sm">{quantityLabel(quantity, unit)} each time</p>
        <p className="text-body-sm text-muted-foreground">
          {anchor < now ? 'Started' : 'Starts'} {formatShortDay(anchor, today)} at{' '}
          {formatTime(anchor)}
        </p>
        {24 % hours !== 0 && (
          <p className="text-body-sm text-muted-foreground">
            These times move through the day, because {hours} hours doesn&apos;t fit evenly into 24.
          </p>
        )}
      </CardContent>
    </Card>
  )
}
