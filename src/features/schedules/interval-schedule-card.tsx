import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card'
import { formatShortDay, formatTime } from '@/lib/calendar-date'
import { quantityLabel, type DoseUnit } from '@/lib/dose-quantity'
import {
  pausedSinceLine,
  scheduleCardName,
  ScheduleCardTitle,
  ScheduleDateLines,
} from './clock-schedule-card'
import { istanbulDate } from './contract'
import { IntervalDoseList } from './interval-dose-list'
import { intervalLabel, nextIntervalDoses } from './interval-preview'
import { nextDosesLabel, untilLastDay } from './last-day'

/**
 * A medication's Interval schedule (212·D1, D2). Its next doses stop at the Last day; an Ended
 * one lists none (227·A14, A17), and a paused one none, reading "Paused since" (233·A5).
 */
export function IntervalScheduleCard({
  hours,
  anchor,
  quantity,
  unit,
  now,
  lastDay = null,
  ended = null,
  paused = null,
}: {
  hours: number
  anchor: string
  quantity: number
  unit: DoseUnit
  now: string
  lastDay?: string | null
  /** The day an Ended schedule ended. */
  ended?: string | null
  /** The day a paused schedule was paused. */
  paused?: string | null
}) {
  const today = istanbulDate(new Date(now))
  const holding = Boolean(ended || paused)
  const doses = untilLastDay(nextIntervalDoses({ anchor, hours, now }), lastDay)
  return (
    <Card role="group" aria-label={scheduleCardName(Boolean(paused))}>
      <CardHeader className="flex flex-row flex-wrap items-baseline justify-between gap-2">
        <ScheduleCardTitle paused={Boolean(paused)} />
        <CardDescription>{intervalLabel(hours)}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {!holding && doses.length > 0 && (
          <>
            <h3 className="text-body-sm font-extrabold">{nextDosesLabel(doses.length, lastDay)}</h3>
            <IntervalDoseList doses={doses} today={today} />
          </>
        )}
        <p className="text-body-sm">{quantityLabel(quantity, unit)} each time</p>
        <ScheduleDateLines
          started={
            paused
              ? pausedSinceLine(paused, today)
              : `${anchor < now ? 'Started' : 'Starts'} ${formatShortDay(anchor, today)} at ${formatTime(anchor)}`
          }
          lastDay={lastDay}
          ended={ended}
          today={today}
        />
        {!holding && 24 % hours !== 0 && (
          <p className="text-body-sm text-muted-foreground">
            These times move through the day, because {hours} hours doesn&apos;t fit evenly into 24.
          </p>
        )}
      </CardContent>
    </Card>
  )
}
