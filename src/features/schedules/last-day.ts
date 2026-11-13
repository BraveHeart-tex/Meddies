import { formatShortDay } from '@/lib/calendar-date'
import { istanbulDate, type DailySchedule } from './contract'

// Last day rules shared by setup, Change schedule, Medication detail and Medications (#227).
// The Worker stays authoritative; these mirror it for inline feedback.

/** The earliest Last day: today, or a later start date or Anchor date. */
export function earliestLastDay(today: string, start: string) {
  return start > today ? start : today
}

/** The field error for a Last day earlier than allowed (227·A3, A5, A18). */
export function lastDayProblem(lastDay: string | null, today: string, start: string) {
  if (!lastDay) return undefined
  const earliest = earliestLastDay(today, start)
  if (lastDay >= earliest) return undefined
  return earliest === today
    ? 'Choose today or a later date.'
    : `Choose ${formatShortDay(earliest, today)} or a later date.`
}

/** The doses on or before the Last day; all of them without one. */
export function untilLastDay<T extends string[] | null>(doses: T, lastDay: string | null): T {
  if (!doses || !lastDay) return doses
  return doses.filter((dose) => istanbulDate(new Date(dose)) <= lastDay) as T
}

/**
 * The day an Ended schedule ended: its stop day, or a Last day that has passed. Null while it
 * still runs, its Last day included.
 */
export function endedOn(schedule: Pick<DailySchedule, 'endDate' | 'stoppedAt'>, today: string) {
  if (schedule.stoppedAt) return istanbulDate(new Date(schedule.stoppedAt))
  return schedule.endDate && schedule.endDate < today ? schedule.endDate : null
}

/** "Next 3 doses", or how many are left before the Last day (227·A4, A8, A11). */
export function nextDosesLabel(count: number, lastDay: string | null | undefined) {
  if (!lastDay || count === 3) return 'Next 3 doses'
  if (count === 0) return 'Next doses'
  return count === 1 ? 'Next dose' : `Next ${count} doses`
}

/** Pause day in Istanbul; a Last day that has passed makes the schedule Ended instead. */
export function pausedOn(
  schedule: Pick<DailySchedule, 'pausedAt' | 'endDate' | 'stoppedAt'>,
  today: string,
) {
  return schedule.pausedAt && !endedOn(schedule, today)
    ? istanbulDate(new Date(schedule.pausedAt))
    : null
}
