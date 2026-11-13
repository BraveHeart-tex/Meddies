import { istanbulHour } from '@/lib/calendar-date'
import type { DailySchedule } from './contract'
import { scheduledInstant } from './occurrences'

const HOUR_MS = 3_600_000

/**
 * The next doses of an Interval schedule after `now`, as instants. A dose falls at Anchor + n x
 * hours and is expected at the Anchor only when the Anchor is later than `now`.
 */
export function nextIntervalDoses({
  anchor,
  hours,
  now,
  count = 3,
  pausedAt,
}: {
  anchor: string
  hours: number
  now: string
  count?: number
  pausedAt?: string | null
}): string[] {
  if (pausedAt) return []
  const start = Date.parse(anchor)
  const step = hours * HOUR_MS
  const first = Math.max(0, Math.floor((Date.parse(now) - start) / step) + 1)
  return Array.from({ length: count }, (_, index) =>
    new Date(start + (first + index) * step).toISOString(),
  )
}

/** The instant an Interval schedule counts from. */
export function intervalAnchor(
  schedule: Pick<DailySchedule, 'startDate' | 'anchorDate' | 'times'>,
) {
  return scheduledInstant(schedule.anchorDate ?? schedule.startDate, schedule.times[0].time)
}

/** 'Every hour' or 'Every 8 hours'. */
export function intervalLabel(hours: number) {
  return hours === 1 ? 'Every hour' : `Every ${hours} hours`
}

/** A moon marks a dose from 22:00 through 06:59. */
export function isOvernightDose(dose: string) {
  const hour = istanbulHour(dose)
  return hour >= 22 || hour < 7
}

/** Checks a full day from the first dose, so a short list can't hide a night dose. */
export function firstOvernightDose(first: string, hours: number) {
  return nextIntervalDoses({
    anchor: first,
    hours,
    now: new Date(Date.parse(first) - 1).toISOString(),
    count: Math.ceil(24 / hours),
  }).find(isOvernightDose)
}
