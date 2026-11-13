import type { DailySchedule } from '@/features/schedules/contract'
import type { ResumeValues } from '@/features/schedules/resume'
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
      ? { anchorDate: anchor.date, times: [{ ...schedule.times[0], time: anchor.time }] }
      : {}),
  } satisfies PausableSchedule
}

export const RESUME_BLANK: ResumeValues = { date: TODAY, time: '' }
export const RESUME_AT_TWO: ResumeValues = { date: TODAY, time: '14:00' }
/** Tuesday at 12:00: the Last day leaves room for two doses. */
export const RESUME_TUESDAY: ResumeValues = { date: TUESDAY, time: '12:00' }
export const RESUME_YESTERDAY: ResumeValues = { date: '2026-11-08', time: '14:00' }
