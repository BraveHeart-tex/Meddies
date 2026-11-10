import { lastDayProblem as lastDayRule } from '@/features/schedules/last-day'
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

/** The production field error, on the lab's clock. */
export const lastDayProblem = (lastDay: string | null, start: string = TODAY) =>
  lastDayRule(lastDay, TODAY, start)
