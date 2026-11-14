import { describe, expect, test } from 'vitest'
import type {
  DailySchedule,
  DoseOutcomeRecord,
  SendSchedule,
} from '../src/features/schedules/contract'
import { scheduleToday } from '../src/features/schedules/occurrences'
import { createScheduleOperations } from '../src/features/schedules/operations'

// #275 "Across midnight": daily 23:30, unresolved. Istanbul is UTC+3.
const schedule = (times: string[]): DailySchedule => ({
  id: '00000000-0000-4000-8000-0000000000a1',
  medicineId: '00000000-0000-4000-8000-000000000001',
  startDate: '2026-11-01',
  times: times.map((time) => ({ time, quantity: 1 })),
  weekdays: [0, 1, 2, 3, 4, 5, 6],
  confirmedAt: '2026-10-31T09:00:00.000Z',
})
const at = (date: string, time: string) => new Date(`${date}T${time}+03:00`)
const due = (date: string, time: string) => new Date(`${date}T${time}:00+03:00`).toISOString()
const yesterdays = (doses: { dueAt: string }[]) =>
  doses.filter((dose) => dose.dueAt < due('2026-11-14', '00:00'))

describe('Across midnight', () => {
  const daily = [schedule(['23:30'])]

  test('at Nov 14 00:10 To log lists the Nov 13 23:30 dose and Up next features it', () => {
    const today = scheduleToday(daily, at('2026-11-14', '00:10:00.000'), [])
    expect(today.date).toBe('2026-11-14')
    expect(today.doses[0]).toMatchObject({
      dueAt: due('2026-11-13', '23:30'),
      status: 'Not logged',
    })
    expect(today.next?.dueAt).toBe(due('2026-11-13', '23:30'))
  })

  test('Up next features it until 00:50, then the next Scheduled dose', () => {
    expect(scheduleToday(daily, at('2026-11-14', '00:50:59.999'), []).next?.dueAt).toBe(
      due('2026-11-13', '23:30'),
    )
    const later = scheduleToday(daily, at('2026-11-14', '00:51:00.000'), [])
    expect(later.next).toMatchObject({ dueAt: due('2026-11-14', '23:30'), status: 'Upcoming' })
    expect(yesterdays(later.doses)).toHaveLength(1)
  })

  test('it leaves Today at Nov 14 23:30', () => {
    expect(
      yesterdays(scheduleToday(daily, at('2026-11-14', '23:29:59.999'), []).doses),
    ).toHaveLength(1)
    const atDue = scheduleToday(daily, at('2026-11-14', '23:30:00.000'), [])
    expect(yesterdays(atDue.doses)).toEqual([])
    expect(atDue.next).toMatchObject({ dueAt: due('2026-11-14', '23:30'), status: 'Due now' })
  })

  test("yesterday's Taken and Skipped doses never appear", () => {
    const records: DoseOutcomeRecord[] = [
      {
        scheduleId: daily[0].id,
        dueAt: due('2026-11-13', '22:00'),
        outcome: 'Taken',
        takenAt: due('2026-11-13', '22:05'),
        quantity: 1,
      },
      {
        scheduleId: daily[0].id,
        dueAt: due('2026-11-13', '23:30'),
        outcome: 'Skipped',
        recordedAt: due('2026-11-13', '23:40'),
      },
    ]
    const today = scheduleToday(
      [schedule(['22:00', '23:30'])],
      at('2026-11-14', '00:10:00.000'),
      records,
    )
    expect(yesterdays(today.doses)).toEqual([])
    expect(today.next?.dueAt).toBe(due('2026-11-14', '22:00'))
  })

  test('only doses due in the 24 hours before now come back', () => {
    // At Nov 14 10:00, Nov 13 09:00 is older than 24 hours; Nov 13 11:00 is not.
    const today = scheduleToday(
      [schedule(['09:00', '11:00'])],
      at('2026-11-14', '10:00:00.000'),
      [],
    )
    expect(yesterdays(today.doses).map((dose) => dose.dueAt)).toEqual([due('2026-11-13', '11:00')])
  })
})

// Catches the Today read covering only today's records, which would show yesterday's logged
// doses as Not logged.
test("the Today snapshot reads yesterday's records too", async () => {
  const daily = schedule(['22:00', '23:30'])
  const takenLate: DoseOutcomeRecord = {
    scheduleId: daily.id,
    dueAt: due('2026-11-13', '22:00'),
    outcome: 'Taken',
    takenAt: due('2026-11-13', '22:05'),
    quantity: 1,
  }
  const dates: string[] = []
  const operations = createScheduleOperations({
    requireUser: async () => ({ id: 'google:alice' }),
    send: (async (command: { date?: string }) => {
      dates.push(command.date!)
      return {
        schedules: [daily],
        records: command.date === '2026-11-13' ? [takenLate] : [],
      }
    }) as SendSchedule,
    now: () => at('2026-11-14', '00:10:00.000'),
  })
  const snapshot = await operations.snapshot()
  expect(dates.sort()).toEqual(['2026-11-13', '2026-11-14'])
  expect(snapshot.records).toEqual([takenLate])
  expect(snapshot.today.doses.map((dose) => dose.dueAt)).toEqual([
    due('2026-11-13', '23:30'),
    due('2026-11-14', '22:00'),
    due('2026-11-14', '23:30'),
  ])
})
