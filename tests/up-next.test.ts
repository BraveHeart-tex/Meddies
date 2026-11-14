import { describe, expect, test } from 'vitest'
import type { DailySchedule, DoseOutcomeRecord } from '../src/features/schedules/contract'
import { scheduleToday } from '../src/features/schedules/occurrences'

// #275 "Up next" examples. Istanbul is UTC+3, so 09:00 there is 06:00Z.
const schedule = (id: string, times: string[], extra: Partial<DailySchedule> = {}) =>
  ({
    id: `00000000-0000-4000-8000-0000000000${id}`,
    medicineId: `00000000-0000-4000-8000-0000000000${id}`,
    startDate: '2026-11-14',
    times: times.map((time) => ({ time, quantity: 1 })),
    weekdays: [0, 1, 2, 3, 4, 5, 6],
    confirmedAt: '2026-10-31T09:00:00.000Z',
    ...extra,
  }) satisfies DailySchedule
const at = (time: string) => new Date(`2026-11-14T${time}+03:00`)
const due = (time: string) => new Date(`2026-11-14T${time}:00+03:00`).toISOString()
const upNext = (schedules: DailySchedule[], time: string, records: DoseOutcomeRecord[] = []) =>
  scheduleToday(schedules, at(time), records).next

describe('Up next', () => {
  test('Up next window: features a Not logged dose through 80 minutes after it, then the next Scheduled one', () => {
    const daily = [schedule('a1', ['09:00', '21:00'])]
    expect(upNext(daily, '10:20:00.000')).toMatchObject({
      dueAt: due('09:00'),
      status: 'Not logged',
    })
    // Inclusive of the whole 80th minute: the clock still reads 10:20.
    expect(upNext(daily, '10:20:59.999')?.dueAt).toBe(due('09:00'))
    const later = scheduleToday(daily, at('10:21:00.000'), [])
    expect(later.next).toMatchObject({ dueAt: due('21:00'), status: 'Upcoming' })
    // 09:00 stays in To log.
    expect(later.doses[0]).toMatchObject({ dueAt: due('09:00'), status: 'Not logged' })
  })

  test('Most recent first: the later of two unresolved doses wins', () => {
    const a = schedule('a1', ['09:00'])
    const b = schedule('b1', ['09:30'])
    const today = scheduleToday([a, b], at('09:35:00.000'), [])
    expect(today.next).toMatchObject({ scheduleId: b.id, status: 'Due now' })
    expect(today.doses.find((dose) => dose.scheduleId === a.id)?.status).toBe('Not logged')
  })

  test('Same instant: the first of them in To log, then the next once it is saved', () => {
    // Listed out of order, so the pick follows To log's order and not the input's.
    const [c, a, b] = ['c1', 'a1', 'b1'].map((id) => schedule(id, ['08:00']))
    const schedules = [c, a, b]
    const toLog = scheduleToday(schedules, at('08:05:00.000'), []).doses
    expect(toLog.map((dose) => dose.scheduleId)).toEqual([a.id, b.id, c.id])
    expect(upNext(schedules, '08:05:00.000')?.scheduleId).toBe(a.id)
    const savedA: DoseOutcomeRecord = {
      scheduleId: a.id,
      dueAt: due('08:00'),
      outcome: 'Skipped',
      recordedAt: at('08:04:00.000').toISOString(),
    }
    expect(upNext(schedules, '08:05:00.000', [savedA])?.scheduleId).toBe(b.id)
  })

  test('Same medicine: every 1 hour features 10:00 Due now; 09:00 is Not logged', () => {
    const hourly = schedule('a1', ['09:00'], { intervalHours: 1, anchorDate: '2026-11-14' })
    const today = scheduleToday([hourly], at('10:05:00.000'), [])
    expect(today.next).toMatchObject({ dueAt: due('10:00'), status: 'Due now' })
    expect(today.doses.find((dose) => dose.dueAt === due('09:00'))?.status).toBe('Not logged')
  })
})
