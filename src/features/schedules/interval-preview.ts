import { formatTime, istanbulHour } from '@/lib/calendar-date'
import type { DailySchedule } from './contract'
import { scheduledInstant } from './occurrences'
import { untilLastDay } from './last-day'

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
function overnightDoses(first: string, hours: number) {
  return nextIntervalDoses({
    anchor: first,
    hours,
    now: new Date(Date.parse(first) - 1).toISOString(),
    count: Math.ceil(24 / hours),
  }).filter(isOvernightDose)
}

/** The first overnight dose in the full-day look-ahead. */
export function firstOvernightDose(first: string, hours: number) {
  return overnightDoses(first, hours)[0]
}

/** Count the full-day look-ahead, excluding doses after Last day, even beyond the short preview. */
export function intervalOvernightNote(first: string, hours: number, lastDay: string | null) {
  const doses = untilLastDay(overnightDoses(first, hours), lastDay)
  if (!doses.length) return undefined
  const time = formatTime(doses[0])
  return doses.length === 1
    ? `Includes a dose overnight, at ${time}.`
    : `Includes doses overnight, from ${time}.`
}
