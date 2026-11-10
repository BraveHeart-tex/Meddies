import { nextClockDoses } from '@/features/schedules/clock-preview'
import { nextIntervalDoses } from '@/features/schedules/interval-preview'
import { scheduledInstant } from '@/features/schedules/occurrences'
import { isTimeOfDay } from '@/lib/time-of-day'
import { NOW, TODAY } from './lab-fixtures'

export type ScheduleKind = 'times' | 'interval'
export type ClockValues = { weekdays: number[]; times: { time: string; quantity: string }[] }
export type IntervalValues = { hours: string; date: string; time: string; quantity: string }

export const EVERY_DAY = [0, 1, 2, 3, 4, 5, 6]

/** Magnesium's current Clock schedule version: every day at 08:00 and 20:00, since Mon 2 Nov. */
export const currentClock: ClockValues = {
  weekdays: EVERY_DAY,
  times: [
    { time: '08:00', quantity: '1' },
    { time: '20:00', quantity: '1' },
  ],
}
export const CLOCK_STARTED = '2026-11-02'

/** Or its current Interval schedule version: every 8 hours from Mon 2 Nov at 08:00. */
export const currentInterval: IntervalValues = {
  hours: '8',
  date: '2026-11-02',
  time: '08:00',
  quantity: '1',
}
export const intervalAnchor = (values: IntervalValues) => scheduledInstant(values.date, values.time)

/** 14:00 added to the Clock schedule, the worked example for a Clock schedule edit. */
export const clockWithLunch: ClockValues = {
  weekdays: EVERY_DAY,
  times: [...currentClock.times, { time: '14:00', quantity: '1' }],
}

/** Every 8 hours changed to every 6, keeping the Anchor. */
export const intervalEverySix: IntervalValues = { ...currentInterval, hours: '6' }

/** A new Anchor after switching from set times: today at 12:00, every 8 hours. */
export const intervalFromNoon: IntervalValues = {
  hours: '8',
  date: TODAY,
  time: '12:00',
  quantity: '1',
}

export function clockDoses({ weekdays, times }: ClockValues, now = NOW) {
  const chosen = times.map((slot) => slot.time).filter(isTimeOfDay)
  if (!weekdays.length || !chosen.length) return null
  return nextClockDoses({ weekdays, times: chosen, now })
}

export function intervalDoses({ hours, date, time }: IntervalValues, now = NOW) {
  const count = /^\d+$/.test(hours) ? Number(hours) : 0
  if (count < 1 || count > 24 || !date || !isTimeOfDay(time)) return null
  return nextIntervalDoses({ anchor: scheduledInstant(date, time), hours: count, now })
}

export type CurrentSchedule =
  { kind: 'times'; clock: ClockValues } | { kind: 'interval'; interval: IntervalValues }

export const clockSchedule: CurrentSchedule = { kind: 'times', clock: currentClock }
export const intervalSchedule: CurrentSchedule = { kind: 'interval', interval: currentInterval }
