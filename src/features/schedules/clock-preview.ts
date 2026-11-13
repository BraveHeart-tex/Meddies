import { shiftDate } from '@/lib/calendar-date'
import { istanbulDate, scheduleRunsOn } from './contract'
import { scheduledInstant } from './occurrences'

/**
 * The next doses of a Clock schedule strictly after `now`, as instants. Scans a bounded week, so a
 * sole weekday still finds its doses.
 */
export function nextClockDoses({
  weekdays,
  times,
  now,
  count = 3,
  pausedAt,
}: {
  weekdays: number[]
  times: string[]
  now: string
  count?: number
  pausedAt?: string | null
}): string[] {
  if (pausedAt) return []
  const today = istanbulDate(new Date(now))
  const schedule = { startDate: today, endDate: null, weekdays }
  const sorted = [...times].sort()
  const doses: string[] = []
  for (let day = 0; day < 15 && doses.length < count; day++) {
    const date = shiftDate(today, day)
    if (!scheduleRunsOn(schedule, date)) continue
    for (const time of sorted) {
      const dose = scheduledInstant(date, time)
      if (dose > now && doses.length < count) doses.push(dose)
    }
  }
  return doses
}
