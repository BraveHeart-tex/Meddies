import assert from 'node:assert/strict'
import { test } from 'vitest'
import { parseSchedule } from '../src/features/schedules/contract'
import { scheduleHistoryDay, scheduleToday } from '../src/features/schedules/occurrences'

const input = {
  id: '10000000-0000-4000-8000-000000000002',
  medicineId: '10000000-0000-4000-8000-000000000001',
  startDate: '2026-11-03',
  times: [{ time: '08:00', quantity: 1 }],
  intervalHours: 8,
}

test('Interval schedule parsing enforces whole hours and one Anchor slot', () => {
  for (const intervalHours of [1, 7, 24])
    assert.equal(parseSchedule({ ...input, intervalHours }).intervalHours, intervalHours)
  for (const intervalHours of [0, -1, 1.5, 25, '8', false])
    assert.throws(() => parseSchedule({ ...input, intervalHours }), /validation/)
  assert.throws(
    () => parseSchedule({ ...input, times: [...input.times, { time: '16:00', quantity: 1 }] }),
    /validation/,
  )
})

test('Interval doses cross midnight on their History date and exclude due instants through save confirmation', () => {
  const schedule = { ...parseSchedule(input), confirmedAt: '2026-11-03T04:00:00.000Z' }
  const now = new Date('2026-11-05T09:00:00.000Z')
  assert.deepEqual(
    scheduleHistoryDay([schedule], '2026-11-03', now, []).map((d) => d.dueAt),
    ['2026-11-03T05:00:00.000Z', '2026-11-03T13:00:00.000Z'],
  )
  assert.equal(
    scheduleHistoryDay([schedule], '2026-11-04', now, [])[0].dueAt,
    '2026-11-03T21:00:00.000Z',
  )
  const earlierAnchor = { ...schedule, confirmedAt: '2026-11-03T07:00:00.000Z' }
  const today = scheduleToday([earlierAnchor], new Date(earlierAnchor.confirmedAt), [])
  assert.deepEqual(
    today.doses.map((d) => d.dueAt),
    ['2026-11-03T13:00:00.000Z'],
  )
  assert.equal(today.next?.dueAt, '2026-11-03T13:00:00.000Z')
  const ended = { ...schedule, endDate: '2026-11-03' }
  assert.deepEqual(scheduleHistoryDay([ended], '2026-11-04', now, []), [])
  assert.equal(scheduleToday([ended], new Date('2026-11-03T20:00:00.000Z'), []).next, null)
})

test('seven elapsed hours continue from the Anchor without resetting each day', () => {
  const schedule = {
    ...parseSchedule({ ...input, intervalHours: 7, times: [{ time: '22:00', quantity: 1 }] }),
    confirmedAt: '2026-11-03T18:00:00.000Z',
  }
  const now = new Date('2026-11-05T00:00:00.000Z')
  assert.deepEqual(
    ['2026-11-03', '2026-11-04', '2026-11-05'].flatMap((date) =>
      scheduleHistoryDay([schedule], date, now, []).map((d) => d.dueAt),
    ),
    [
      '2026-11-03T19:00:00.000Z',
      '2026-11-04T02:00:00.000Z',
      '2026-11-04T09:00:00.000Z',
      '2026-11-04T16:00:00.000Z',
      '2026-11-04T23:00:00.000Z',
    ],
  )
})

test('Today next crosses midnight, accepts any Anchor minute and excludes equality at confirmation', () => {
  const schedule = { ...parseSchedule(input), confirmedAt: '2026-11-03T04:00:00.000Z' }
  const today = scheduleToday([schedule], new Date('2026-11-03T14:00:00.000Z'), [])
  assert.equal(today.next?.dueAt, '2026-11-03T21:00:00.000Z')
  assert.equal(today.next?.id, `${schedule.id}:2026-11-03T21:00:00.000Z`)
  const exact = {
    ...parseSchedule({ ...input, intervalHours: 24, times: [{ time: '08:17', quantity: 1 }] }),
    confirmedAt: '2026-11-03T05:17:00.000Z',
  }
  const atSave = scheduleToday([exact], new Date(exact.confirmedAt), [])
  assert.deepEqual(atSave.doses, [])
  assert.equal(atSave.next?.dueAt, '2026-11-04T05:17:00.000Z')
})
