import { shiftDate } from '@/lib/calendar-date'
import { istanbulDate, scheduleRunsOn, type DailySchedule } from './contract'
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

/**
 * A Clock schedule's next dose strictly after `now` on a day it runs, with that time's quantity
 * (238·A3). None before its start day, while paused, once Ended, or when the Last day leaves none.
 */
export function nextClockDose(
  schedule: Pick<
    DailySchedule,
    'weekdays' | 'times' | 'startDate' | 'endDate' | 'stoppedAt' | 'pausedAt'
  >,
  now: string,
): { instant: string; time: string; quantity: number } | null {
  const today = istanbulDate(new Date(now))
  if (schedule.startDate > today) return null
  const times = [...schedule.times].sort((a, b) => a.time.localeCompare(b.time))
  // Today and a full week after it reach any weekday.
  for (let day = 0; day <= 7; day++) {
    const date = shiftDate(today, day)
    if (!scheduleRunsOn(schedule, date)) continue
    for (const { time, quantity } of times) {
      const instant = scheduledInstant(date, time)
      if (instant > now) return { instant, time, quantity }
    }
  }
  return null
}
