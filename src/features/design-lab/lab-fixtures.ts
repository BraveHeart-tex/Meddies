import type { Medicine } from '@/features/medicines/contract'
import type { DailySchedule, DoseRecord } from '@/features/schedules/contract'
import { scheduleHistoryDay } from '@/features/schedules/occurrences'
import type { QueryFixtures } from './fixture-query'

/** Saved at 10:00 Istanbul on Monday 9 November. */
export const NOW = '2026-11-09T07:00:00.000Z'
export const TODAY = '2026-11-09'

export const magnesium: Medicine = {
  id: '11111111-1111-4111-8111-111111111111',
  label: 'Magnesium',
  strength: '400 mg',
  unit: 'tablet',
}

/** Ibuprofen has no schedule: every dose of it is an Unscheduled dose. */
export const ibuprofen: Medicine = {
  id: '66666666-6666-4666-8666-666666666666',
  label: 'Ibuprofen',
  strength: '200 mg',
  unit: 'tablet',
}

/** Magnesium every day at 08:00 and 20:00 since Mon 2 Nov, Last day Tue 10 Nov. */
export const magnesiumSchedule: DailySchedule = {
  id: '11111111-1111-4111-8111-1111111111b1',
  medicineId: magnesium.id,
  startDate: '2026-11-02',
  weekdays: [0, 1, 2, 3, 4, 5, 6],
  times: [
    { time: '08:00', quantity: 1 },
    { time: '20:00', quantity: 1 },
  ],
  intervalHours: null,
  endDate: '2026-11-10',
  confirmedAt: '2026-11-01T18:00:00.000Z',
  stoppedAt: null,
}

export const iron: Medicine = {
  ...magnesium,
  id: '22222222-2222-4222-8222-222222222222',
  label: 'Iron',
}

export const vitaminD: Medicine = {
  ...magnesium,
  id: '44444444-4444-4444-8444-444444444444',
  label: 'Vitamin D',
  strength: null,
}

/** Iron every day at 22:00 since Mon 2 Nov, with no Last day. */
export const ironSchedule: DailySchedule = {
  ...magnesiumSchedule,
  id: '22222222-2222-4222-8222-2222222222b1',
  medicineId: iron.id,
  times: [{ time: '22:00', quantity: 1 }],
  endDate: null,
}

/** Today's 08:00 Magnesium, taken at 08:05. */
export const morningTaken: DoseRecord = {
  outcome: 'Taken',
  scheduleId: magnesiumSchedule.id,
  dueAt: '2026-11-09T05:00:00.000Z',
  takenAt: '2026-11-09T05:05:00.000Z',
  quantity: 1,
  revision: 1,
}

/**
 * The routine the built frames show at 10:00 today: Magnesium and Iron on a schedule, Vitamin D
 * without one, and the 08:00 Magnesium taken.
 */
export const routine = {
  now: NOW,
  medicines: [magnesium, iron, vitaminD],
  snapshot: {
    schedules: [magnesiumSchedule, ironSchedule],
    records: [morningTaken],
    now: NOW,
    date: TODAY,
  },
  history: {
    [TODAY]: scheduleHistoryDay([magnesiumSchedule, ironSchedule], TODAY, new Date(NOW), [
      morningTaken,
    ]),
  },
} satisfies QueryFixtures

/** The session end Settings shows: Mon 16 Nov at 10:00, a week after NOW. */
export const SESSION_EXPIRES = '2026-11-16T07:00:00.000Z'
