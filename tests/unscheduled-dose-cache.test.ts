import { QueryClient } from '@tanstack/react-query'
import { expect, test } from 'vitest'
import type { UnscheduledDose } from '../src/features/unscheduled-doses/contract'
import { removedMessage, savedMessage } from '../src/features/unscheduled-doses/messages'
import {
  mergeUnscheduledDay,
  shownUnscheduled,
  unscheduledKeys,
  writeUnscheduledDose,
} from '../src/features/unscheduled-doses/queries'

const ibuprofen = { label: 'Ibuprofen', unit: 'tablet' as const }
// 09:30 on Mon 9 Nov in Istanbul.
const saved: UnscheduledDose = {
  id: '77777777-7777-4777-8777-000000000001',
  actionId: '88888888-8888-4888-8888-000000000001',
  medicineId: '66666666-6666-4666-8666-666666666666',
  takenAt: '2026-11-09T06:30:00.000Z',
  quantity: 1,
  outcome: 'Taken',
  revision: 0,
  removed: false,
}
const removed = { ...saved, actionId: 'removal', revision: 1, removed: true }

test('save messages name the day only when the dose was not taken today', () => {
  expect(savedMessage(ibuprofen, saved, '2026-11-09')).toBe('Ibuprofen · taken at 09:30, 1 tablet')
  expect(
    savedMessage(ibuprofen, { takenAt: '2026-11-08T20:30:00.000Z', quantity: 0.5 }, '2026-11-09'),
  ).toBe('Ibuprofen · taken at 23:30 on Sun 8 Nov, ½ tablet')
  expect(savedMessage(ibuprofen, saved, '2026-11-09', true)).toBe(
    'Ibuprofen · changed to taken at 09:30, 1 tablet',
  )
  expect(removedMessage(ibuprofen, saved)).toBe('Ibuprofen 09:30 · dose removed')
})

test('a stale read never brings back a removed dose, and a fresh read drops it', () => {
  const merged = mergeUnscheduledDay([removed], [saved])
  expect(shownUnscheduled(merged, '2026-11-09')).toEqual([])
  expect(mergeUnscheduledDay([removed], [])).toEqual([])
})

test('a change moving a dose to yesterday leaves today and lands on yesterday', () => {
  const client = new QueryClient()
  client.setQueryData(unscheduledKeys.day('2026-11-09'), [saved])
  client.setQueryData(unscheduledKeys.day('2026-11-08'), [])
  const moved = { ...saved, actionId: 'change', revision: 1, takenAt: '2026-11-08T20:30:00.000Z' }
  expect(writeUnscheduledDose(client, moved, saved)).toEqual(['2026-11-08', '2026-11-09'])
  const day = (date: string) =>
    shownUnscheduled(client.getQueryData(unscheduledKeys.day(date)), date)
  expect(day('2026-11-09')).toEqual([])
  expect(day('2026-11-08')).toEqual([moved])
  // An older revision arriving later never moves it back.
  writeUnscheduledDose(client, saved)
  expect(day('2026-11-08')).toEqual([moved])
})
