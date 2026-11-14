import { describe, expect, test } from 'vitest'
import type { DailySchedule } from '../src/features/schedules/contract'
import { scheduleHistoryDay, scheduleToday } from '../src/features/schedules/occurrences'

// #275 "Due now window": daily 09:00 (06:00Z in Istanbul), nothing recorded.
const schedule: DailySchedule = {
  id: '00000000-0000-4000-8000-0000000000a1',
  medicineId: '00000000-0000-4000-8000-000000000001',
  startDate: '2026-11-14',
  times: [{ time: '09:00', quantity: 1 }],
  weekdays: [0, 1, 2, 3, 4, 5, 6],
  confirmedAt: '2026-10-31T09:00:00.000Z',
}
const at = (time: string) => new Date(`2026-11-14T${time}+03:00`)
const todayStatus = (time: string) => scheduleToday([schedule], at(time), []).doses[0].status
const historyStatus = (time: string) =>
  scheduleHistoryDay([schedule], '2026-11-14', at(time), [])[0]?.status

describe('Due now window', () => {
  test.each([
    ['08:59:59.999', 'Upcoming'],
    ['09:00:00.000', 'Due now'],
    ['09:14:59.999', 'Due now'],
    ['09:15:00.000', 'Not logged'],
  ])('Today at %s reads %s', (time, status) => {
    expect(todayStatus(time)).toBe(status)
  })

  test.each([
    ['09:00:00.000', 'Due now'],
    ['09:14:59.999', 'Due now'],
    ['09:15:00.000', 'Not logged'],
  ])('History at %s reads %s', (time, status) => {
    expect(historyStatus(time)).toBe(status)
  })

  test('History lists no dose before it is due', () => {
    expect(historyStatus('08:59:59.999')).toBeUndefined()
  })

  test('Up next keeps the dose as it turns from Due now to Not logged', () => {
    expect(scheduleToday([schedule], at('09:14:59.999'), []).next?.status).toBe('Due now')
    expect(scheduleToday([schedule], at('09:15:00.000'), []).next).toMatchObject({
      dueAt: '2026-11-14T06:00:00.000Z',
      status: 'Not logged',
    })
  })
})
