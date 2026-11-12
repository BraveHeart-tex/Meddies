import { nextClockDoses } from '@/features/schedules/clock-preview'
import { istanbulDate, type DailySchedule } from '@/features/schedules/contract'
import { nextIntervalDoses } from '@/features/schedules/interval-preview'
import { scheduledInstant } from '@/features/schedules/occurrences'
import { untilLastDay } from '@/features/schedules/last-day'
import { formatShortDay, formatTime } from '@/lib/calendar-date'
import { isTimeOfDay } from '@/lib/time-of-day'
import { CLOCK_STARTED, EVERY_DAY } from './edit-lab-model'
import { magnesium, NOW, TODAY } from './lab-fixtures'
import { TUESDAY } from './last-day-model'

/** A Schedule version that may be paused; `pausedAt` is the pause's Edit time. */
export type PausableSchedule = DailySchedule & { pausedAt: string | null }

const RUNNING_ID = '11111111-1111-4111-8111-1111111111b1'

/** Magnesium every day at 08:00 and 20:00 since Mon 2 Nov, Last day Tue 10 Nov. */
export const clockRunning: PausableSchedule = {
  id: RUNNING_ID,
  medicineId: magnesium.id,
  startDate: CLOCK_STARTED,
  weekdays: EVERY_DAY,
  times: [
    { time: '08:00', quantity: 1 },
    { time: '20:00', quantity: 1 },
  ],
  intervalHours: null,
  endDate: TUESDAY,
  confirmedAt: '2026-11-01T18:00:00.000Z',
  stoppedAt: null,
  pausedAt: null,
}

/** Or every 8 hours from Mon 2 Nov at 08:00, Last day Tue 10 Nov. */
export const intervalRunning: PausableSchedule = {
  ...clockRunning,
  times: [{ time: '08:00', quantity: 1 }],
  intervalHours: 8,
}

const pausedNow = (schedule: PausableSchedule): PausableSchedule => ({
  ...schedule,
  id: '11111111-1111-4111-8111-1111111111b2',
  basedOnId: RUNNING_ID,
  confirmedAt: NOW,
  pausedAt: NOW,
})

export const clockPaused = pausedNow(clockRunning)
export const intervalPaused = pausedNow(intervalRunning)

/** Paused with 08:00 only and today as its Last day: resuming at 10:00 leaves no dose. */
export const clockPausedLastDay = pausedNow({
  ...clockRunning,
  times: [{ time: '08:00', quantity: 1 }],
  endDate: TODAY,
})

/** The new version after Resume at NOW: a Clock schedule keeps its times and Last day. */
export function resumed(schedule: PausableSchedule, anchor?: { date: string; time: string }) {
  return {
    ...schedule,
    id: '11111111-1111-4111-8111-1111111111b3',
    basedOnId: schedule.id,
    confirmedAt: NOW,
    pausedAt: null,
    ...(anchor
      ? { startDate: anchor.date, times: [{ ...schedule.times[0], time: anchor.time }] }
      : {}),
  } satisfies PausableSchedule
}

export const pausedSince = (schedule: PausableSchedule) =>
  schedule.pausedAt ? `Paused since ${formatShortDay(schedule.pausedAt, TODAY)}` : null

/** The first dose a resumed version expects after NOW, within its Last day. */
export function firstDoseAfterResume(schedule: PausableSchedule) {
  const doses =
    schedule.intervalHours != null
      ? nextIntervalDoses({
          anchor: scheduledInstant(schedule.startDate, schedule.times[0].time),
          hours: schedule.intervalHours,
          now: NOW,
          count: 1,
        })
      : nextClockDoses({
          weekdays: schedule.weekdays,
          times: schedule.times.map((slot) => slot.time),
          now: NOW,
          count: 1,
        })
  return untilLastDay(doses, schedule.endDate ?? null)[0] ?? null
}

/** "today at 20:00" or "Tue 10 Nov at 08:00". */
export function doseWhen(dose: string) {
  const day = istanbulDate(new Date(dose)) === TODAY ? 'today' : formatShortDay(dose, TODAY)
  return `${day} at ${formatTime(dose)}`
}

/** A new Anchor's doses after NOW, or null until a valid date and time are chosen. */
export function resumeDoses({ date, time }: { date: string; time: string }, hours = 8) {
  if (!date || !isTimeOfDay(time)) return null
  return nextIntervalDoses({ anchor: scheduledInstant(date, time), hours, now: NOW })
}

export type ResumeValues = { date: string; time: string }
export const RESUME_BLANK: ResumeValues = { date: TODAY, time: '' }
export const RESUME_AT_TWO: ResumeValues = { date: TODAY, time: '14:00' }
/** Tuesday at 12:00: the Last day leaves room for two doses. */
export const RESUME_TUESDAY: ResumeValues = { date: TUESDAY, time: '12:00' }
export const RESUME_YESTERDAY: ResumeValues = { date: '2026-11-08', time: '14:00' }
