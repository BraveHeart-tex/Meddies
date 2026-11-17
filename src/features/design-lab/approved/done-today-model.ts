import type { DailySchedule, DoseOutcomeRecord } from '@/features/schedules/contract'
import type { QueryFixtures } from '../fixture-query'
import {
  amoxicillin,
  amoxicillinSchedule,
  eyeDrops,
  eyeDropsSchedule,
  iron,
  ironSchedule,
  magnesium,
  magnesiumSchedule,
  salbutamol,
  salbutamolSchedule,
  TODAY,
  vitaminD,
} from '../lab-fixtures'

/**
 * #373 approved direction B: Today once nothing is left to feature today: four routines on Mon 9 Nov, each with every
 * dose due today logged, and the done-for-today line each one shows (docs/copy.md: the
 * empty-day state's sentence shape).
 */

const medicines = [magnesium, iron, amoxicillin, salbutamol, eyeDrops, vitaminD]

const taken = (
  schedule: DailySchedule,
  dueAt: string,
  quantity = schedule.times[0].quantity,
): DoseOutcomeRecord => ({
  outcome: 'Taken',
  scheduleId: schedule.id,
  dueAt,
  takenAt: new Date(Date.parse(dueAt) + 5 * 60_000).toISOString(),
  quantity,
  revision: 1,
})

function routineAt(now: string, schedules: DailySchedule[], records: DoseOutcomeRecord[]) {
  return {
    now,
    medicines,
    snapshot: { schedules, records, now, date: TODAY },
  } satisfies QueryFixtures
}

/** What the line says: the title only while To log is empty, the next dose when there is one. */
export type DoneLine = { allLogged: boolean; next?: string }

/** Iron every day at 00:30; Magnesium and Amoxicillin at 08:00 and 20:00. Now 23:50. */
const lateIron: DailySchedule = { ...ironSchedule, times: [{ time: '00:30', quantity: 1 }] }

export const lateNight = {
  fixtures: routineAt(
    '2026-11-09T20:50:00.000Z',
    [lateIron, magnesiumSchedule, amoxicillinSchedule],
    [
      taken(lateIron, '2026-11-08T21:30:00.000Z'),
      taken(magnesiumSchedule, '2026-11-09T05:00:00.000Z'),
      taken(amoxicillinSchedule, '2026-11-09T05:00:00.000Z', 5),
      taken(magnesiumSchedule, '2026-11-09T17:00:00.000Z'),
      taken(amoxicillinSchedule, '2026-11-09T17:00:00.000Z', 2.5),
    ],
  ),
  line: { allLogged: true, next: 'Next is Iron on Tue 10 Nov at 00:30.' },
} satisfies { fixtures: QueryFixtures; line: DoneLine }

/** Salbutamol on Mon and Thu at 09:00 and 14:00; Magnesium's Last day is today. Now 21:00. */
const salbutamolMonThu: DailySchedule = { ...salbutamolSchedule, weekdays: [1, 4] }
const magnesiumEndsToday: DailySchedule = { ...magnesiumSchedule, endDate: TODAY }

export const daysAway = {
  fixtures: routineAt(
    '2026-11-09T18:00:00.000Z',
    [salbutamolMonThu, magnesiumEndsToday],
    [
      taken(magnesiumEndsToday, '2026-11-09T05:00:00.000Z'),
      taken(salbutamolMonThu, '2026-11-09T06:00:00.000Z', 1),
      taken(salbutamolMonThu, '2026-11-09T11:00:00.000Z', 2),
      taken(magnesiumEndsToday, '2026-11-09T17:00:00.000Z'),
    ],
  ),
  line: { allLogged: true, next: 'Next is Salbutamol on Thu 12 Nov at 09:00.' },
} satisfies { fixtures: QueryFixtures; line: DoneLine }

/** Magnesium and Amoxicillin both end today; the 20:00 Amoxicillin was skipped. Now 21:00. */
const amoxicillinEndsToday: DailySchedule = { ...amoxicillinSchedule, endDate: TODAY }

export const noNext = {
  fixtures: routineAt(
    '2026-11-09T18:00:00.000Z',
    [magnesiumEndsToday, amoxicillinEndsToday],
    [
      taken(magnesiumEndsToday, '2026-11-09T05:00:00.000Z'),
      taken(amoxicillinEndsToday, '2026-11-09T05:00:00.000Z', 5),
      taken(magnesiumEndsToday, '2026-11-09T17:00:00.000Z'),
      {
        outcome: 'Skipped',
        scheduleId: amoxicillinEndsToday.id,
        dueAt: '2026-11-09T17:00:00.000Z',
        recordedAt: '2026-11-09T17:10:00.000Z',
        revision: 1,
      },
    ],
  ),
  line: { allLogged: true },
} satisfies { fixtures: QueryFixtures; line: DoneLine }

/**
 * Eye drops at 07:00 and Magnesium at 08:00, both logged; Iron on Sundays at 22:00, yesterday's
 * still unlogged, 12½ hours old. Now 10:30.
 */
const morningMagnesium: DailySchedule = {
  ...magnesiumSchedule,
  times: [{ time: '08:00', quantity: 1 }],
  endDate: null,
}
const sundayIron: DailySchedule = { ...ironSchedule, weekdays: [0] }

export const yesterdayLeft = {
  fixtures: routineAt(
    '2026-11-09T07:30:00.000Z',
    [eyeDropsSchedule, morningMagnesium, sundayIron],
    [
      taken(eyeDropsSchedule, '2026-11-09T04:00:00.000Z'),
      taken(morningMagnesium, '2026-11-09T05:00:00.000Z'),
    ],
  ),
  line: { allLogged: false, next: 'Next is Eye drops on Tue 10 Nov at 07:00.' },
} satisfies { fixtures: QueryFixtures; line: DoneLine }
