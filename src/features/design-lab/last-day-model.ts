import { istanbulDate } from '@/features/schedules/contract'
import { formatShortDay } from '@/lib/calendar-date'
import { TODAY } from './lab-fixtures'
import { clockSchedule, intervalSchedule, type CurrentSchedule } from './edit-lab-model'

export const TUESDAY = '2026-11-10'
export const WEDNESDAY = '2026-11-11'
/** The Last day of the Ended example, a week before the lab's today. */
export const ENDED_ON = '2026-11-03'

/** A schedule version with its optional Last day. */
export type LastDaySchedule = CurrentSchedule & { lastDay: string | null }

export const clockToTuesday: LastDaySchedule = { ...clockSchedule, lastDay: TUESDAY }
export const intervalToTuesday: LastDaySchedule = { ...intervalSchedule, lastDay: TUESDAY }
export const clockEnded: LastDaySchedule = { ...clockSchedule, lastDay: ENDED_ON }

export const shortDay = (date: string) => formatShortDay(date, TODAY)

/** The doses on or before the Last day; all of them without one. */
export function untilLastDay(doses: string[] | null, lastDay: string | null) {
  if (!doses || !lastDay) return doses
  return doses.filter((dose) => istanbulDate(new Date(dose)) <= lastDay)
}

/** The earliest Last day: today, or a later start date or Anchor date. */
export function lastDayProblem(lastDay: string | null, start: string = TODAY) {
  if (!lastDay) return undefined
  const earliest = start > TODAY ? start : TODAY
  if (lastDay >= earliest) return undefined
  return earliest === TODAY
    ? 'Choose today or a later date.'
    : `Choose ${shortDay(earliest)} or a later date.`
}
