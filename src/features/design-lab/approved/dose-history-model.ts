import type { DoseHistory, DoseHistoryDose } from '@/features/dose-history/contract'
import { doseTotals } from '@/features/dose-history/contract'
import type { Medicine } from '@/features/medicines/contract'
import type { DailySchedule } from '@/features/schedules/contract'
import { shiftDate } from '@/lib/calendar-date'
import { magnesiumSchedule, TODAY } from '../lab-fixtures'

/**
 * #387 Dose history example: Ibuprofen tablets every day at 08:00 and 20:00 since Thu 1 Oct, 200 mg
 * until Wed 28 Oct 09:00 Istanbul, then 400 mg. Today (Mon 9 Nov, 10:00) its 08:00 dose is still
 * saving. Sun 8 Nov adds a ½-tablet dose at 14:10 with no schedule, Thursday's 20:00 dose was
 * skipped, and Mon 26 Oct's 20:00 dose was taken at 00:30 on Tue 27 Oct.
 */
export const ibuprofen: Medicine = {
  id: '88888888-8888-4888-8888-888888888888',
  label: 'Ibuprofen',
  strength: '400 mg',
  unit: 'tablet',
  revision: 2,
  currentStrengthRevisionId: '88888888-8888-4888-8888-8888888888c2',
  everHadSchedule: true,
  everHadDose: true,
  strengthRevisions: [
    {
      id: '88888888-8888-4888-8888-8888888888c1',
      strength: '200 mg',
      effectiveAt: '0001-01-01T00:00:00.000Z',
      label: 'Ibuprofen',
      unit: 'tablet',
      previousValues: [],
    },
    {
      id: '88888888-8888-4888-8888-8888888888c2',
      strength: '400 mg',
      effectiveAt: '2026-10-28T06:00:00.000Z',
      label: 'Ibuprofen',
      unit: 'tablet',
      previousValues: [],
    },
  ],
}

export const ibuprofenSchedule: DailySchedule = {
  ...magnesiumSchedule,
  id: '88888888-8888-4888-8888-8888888888b1',
  medicineId: ibuprofen.id,
  startDate: '2026-10-01',
  endDate: null,
  confirmedAt: '2026-09-30T18:00:00.000Z',
}

/** Istanbul is UTC+3 all year. */
const instant = (date: string, time: string) =>
  new Date(`${date}T${time}:00.000+03:00`).toISOString()
const strengthAt = (takenAt: string) => (takenAt < '2026-10-28T06:00:00.000Z' ? '200 mg' : '400 mg')

function scheduled(date: string, due: string, taken: string, takenDate = date): DoseHistoryDose {
  const takenAt = instant(takenDate, taken)
  return {
    kind: 'scheduled',
    scheduleId: ibuprofenSchedule.id,
    dueAt: instant(date, due),
    historyDate: date,
    takenAt,
    quantity: 1,
    unit: 'tablet',
    strength: strengthAt(takenAt),
    revision: 1,
  }
}

/** Every Taken dose, newest first, as the read returns them. */
function takenDoses(): DoseHistoryDose[] {
  const doses: DoseHistoryDose[] = []
  for (let date = '2026-10-01'; date < TODAY; date = shiftDate(date, 1)) {
    if (date === '2026-10-26') doses.push(scheduled(date, '08:00', '08:05'))
    else if (date === '2026-10-27')
      doses.push(
        scheduled('2026-10-26', '20:00', '00:30', date),
        scheduled(date, '08:00', '08:05'),
        scheduled(date, '20:00', '20:05'),
      )
    else if (date === '2026-11-08')
      doses.push(
        scheduled(date, '08:00', '08:05'),
        {
          kind: 'unscheduled',
          id: '88888888-8888-4888-8888-8888888888d1',
          historyDate: date,
          takenAt: instant(date, '14:10'),
          quantity: 0.5,
          unit: 'tablet',
          strength: '400 mg',
          revision: 1,
        },
        scheduled(date, '20:00', '20:15'),
      )
    else if (date === '2026-11-05') doses.push(scheduled(date, '08:00', '08:05'))
    else doses.push(scheduled(date, '08:00', '08:05'), scheduled(date, '20:00', '20:05'))
  }
  doses.push(scheduled(TODAY, '08:00', '08:10'))
  return doses.sort((a, b) => b.takenAt.localeCompare(a.takenAt))
}

const doses = takenDoses()
const intakeDay = (dose: DoseHistoryDose) =>
  new Date(Date.parse(dose.takenAt) + 3 * 3_600_000).toISOString().slice(0, 10)
const since = (first: string) => doses.filter((dose) => intakeDay(dose) >= first)

/** The 14 newest days with a Taken dose; older days load from `before`. */
const days = [...new Set(doses.map(intakeDay))].slice(0, 14).map((date) => {
  const dayDoses = doses.filter((dose) => intakeDay(dose) === date)
  return { date, doses: dayDoses, totals: doseTotals(dayDoses) }
})

/** The first page of Ibuprofen's Dose history. */
export const ibuprofenHistory: DoseHistory = {
  medicineId: ibuprofen.id,
  days,
  before: days.at(-1)!.date,
  summary: {
    lastDose: doses[0],
    today: doseTotals(since(TODAY)),
    last7Days: doseTotals(since(shiftDate(TODAY, -6))),
    last30Days: doseTotals(since(shiftDate(TODAY, -29))),
  },
}

/** Today's 08:00 dose, still saving. */
export const savingDoseAt = doses[0].takenAt

/** A medication with no Taken dose yet. */
export const emptyHistory: DoseHistory = {
  medicineId: ibuprofen.id,
  days: [],
  before: null,
  summary: { lastDose: null, today: [], last7Days: [], last30Days: [] },
}
