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
  revision: 1,
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

/** A Liquid: 250 mg/5 ml, amounts in ml. */
export const amoxicillin: Medicine = {
  id: '55555555-5555-4555-8555-555555555555',
  label: 'Amoxicillin',
  strength: '250 mg/5 ml',
  unit: 'liquid',
  revision: 1,
}

/** Amoxicillin every day at 08:00 (5 ml) and 20:00 (2.5 ml) since Mon 2 Nov, with no Last day. */
export const amoxicillinSchedule: DailySchedule = {
  ...magnesiumSchedule,
  id: '55555555-5555-4555-8555-5555555555b1',
  medicineId: amoxicillin.id,
  times: [
    { time: '08:00', quantity: 5 },
    { time: '20:00', quantity: 2.5 },
  ],
  endDate: null,
}

/** Today's 08:00 Amoxicillin, taken at 08:10 as 4.5 ml of the scheduled 5 ml. */
export const amoxicillinTaken: DoseRecord = {
  outcome: 'Taken',
  scheduleId: amoxicillinSchedule.id,
  dueAt: '2026-11-09T05:00:00.000Z',
  takenAt: '2026-11-09T05:10:00.000Z',
  quantity: 4.5,
  revision: 1,
}

/** An Inhaler: 100 mcg per puff, amounts in puffs. */
export const salbutamol: Medicine = {
  id: '66666666-6666-4666-8666-666666666666',
  label: 'Salbutamol',
  strength: '100 mcg per puff',
  unit: 'inhaler',
  revision: 1,
}

/** Salbutamol every day at 09:00 (1 puff) and 14:00 (2 puffs) since Mon 2 Nov, with no Last day. */
export const salbutamolSchedule: DailySchedule = {
  ...magnesiumSchedule,
  id: '66666666-6666-4666-8666-6666666666b1',
  medicineId: salbutamol.id,
  times: [
    { time: '09:00', quantity: 1 },
    { time: '14:00', quantity: 2 },
  ],
  endDate: null,
}

/** Drops: 0.5%, amounts in drops. */
export const eyeDrops: Medicine = {
  id: '77777777-7777-4777-8777-777777777777',
  label: 'Eye drops',
  strength: '0.5%',
  unit: 'drops',
  revision: 1,
}

/** Eye drops every day at 07:00 (1 drop) since Mon 2 Nov, with no Last day. */
export const eyeDropsSchedule: DailySchedule = {
  ...magnesiumSchedule,
  id: '77777777-7777-4777-8777-7777777777b1',
  medicineId: eyeDrops.id,
  times: [{ time: '07:00', quantity: 1 }],
  endDate: null,
}

/** Today's 07:00 Eye drops, taken at 07:05 as 2 drops of the scheduled 1 drop. */
export const eyeDropsTaken: DoseRecord = {
  outcome: 'Taken',
  scheduleId: eyeDropsSchedule.id,
  dueAt: '2026-11-09T04:00:00.000Z',
  takenAt: '2026-11-09T04:05:00.000Z',
  quantity: 2,
  revision: 1,
}

/** Today's 09:00 Salbutamol, taken at 09:02. */
export const salbutamolTaken: DoseRecord = {
  outcome: 'Taken',
  scheduleId: salbutamolSchedule.id,
  dueAt: '2026-11-09T06:00:00.000Z',
  takenAt: '2026-11-09T06:02:00.000Z',
  quantity: 1,
  revision: 1,
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
 * Yesterday's 14:00 Salbutamol, 20:00 Magnesium and Amoxicillin and 22:00 Iron, all taken, so
 * To log has no dose from Sun 8 Nov.
 */
const yesterdayTaken: DoseRecord[] = [
  {
    outcome: 'Taken',
    scheduleId: salbutamolSchedule.id,
    dueAt: '2026-11-08T11:00:00.000Z',
    takenAt: '2026-11-08T11:02:00.000Z',
    quantity: 2,
    revision: 1,
  },
  {
    outcome: 'Taken',
    scheduleId: magnesiumSchedule.id,
    dueAt: '2026-11-08T17:00:00.000Z',
    takenAt: '2026-11-08T17:05:00.000Z',
    quantity: 1,
    revision: 1,
  },
  {
    outcome: 'Taken',
    scheduleId: amoxicillinSchedule.id,
    dueAt: '2026-11-08T17:00:00.000Z',
    takenAt: '2026-11-08T17:05:00.000Z',
    quantity: 2.5,
    revision: 1,
  },
  {
    outcome: 'Taken',
    scheduleId: ironSchedule.id,
    dueAt: '2026-11-08T19:00:00.000Z',
    takenAt: '2026-11-08T19:05:00.000Z',
    quantity: 1,
    revision: 1,
  },
]

const schedules = [
  magnesiumSchedule,
  ironSchedule,
  amoxicillinSchedule,
  salbutamolSchedule,
  eyeDropsSchedule,
]
const todayTaken = [eyeDropsTaken, morningTaken, amoxicillinTaken, salbutamolTaken]

/**
 * The routine the built frames show at 10:00 today: Magnesium, Iron, the Liquid Amoxicillin, the
 * Inhaler Salbutamol and the Drops on a schedule, Vitamin D without one, and the 07:00 Eye drops,
 * 08:00 Magnesium and Amoxicillin and 09:00 Salbutamol taken.
 */
export const routine = {
  now: NOW,
  medicines: [magnesium, iron, amoxicillin, salbutamol, eyeDrops, vitaminD],
  snapshot: {
    schedules,
    records: [...yesterdayTaken, ...todayTaken],
    now: NOW,
    date: TODAY,
  },
  history: {
    [TODAY]: scheduleHistoryDay(schedules, TODAY, new Date(NOW), todayTaken),
  },
} satisfies QueryFixtures

/** The session end Settings shows: Mon 16 Nov at 10:00, a week after NOW. */
export const SESSION_EXPIRES = '2026-11-16T07:00:00.000Z'
