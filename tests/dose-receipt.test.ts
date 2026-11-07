import { expect, test } from 'vitest'
import { matchesDoseReceipt, type DoseAttempt } from '../src/features/schedules/dose-receipt'
import type { DoseOutcomeRecord } from '../src/features/schedules/contract'

const attempt: DoseAttempt = {
  id: 'attempt-1',
  fingerprint: 'details',
  method: 'PUT',
  payload: {
    scheduleId: 'schedule-1',
    dueAt: '2026-11-07T06:00:00.000Z',
    outcome: 'Taken',
    takenAt: '2026-11-07T06:01:00.000Z',
    quantity: 0.5,
  },
}
const record: DoseOutcomeRecord = {
  scheduleId: 'schedule-1',
  dueAt: '2026-11-07T06:00:00.000Z',
  outcome: 'Taken',
  takenAt: '2026-11-07T06:01:00.000Z',
  quantity: 0.5,
  revision: 0,
}

test('initial receipt requires the original revision, occurrence and exact intake details', () => {
  expect(matchesDoseReceipt(record, attempt)).toBe(true)
  expect(matchesDoseReceipt({ ...record, quantity: 1 }, attempt)).toBe(false)
  expect(matchesDoseReceipt({ ...record, takenAt: '2026-11-07T06:02:00.000Z' }, attempt)).toBe(
    false,
  )
  expect(matchesDoseReceipt({ ...record, dueAt: '2026-11-08T06:00:00.000Z' }, attempt)).toBe(false)
  expect(matchesDoseReceipt({ ...record, revision: 2 }, attempt)).toBe(false)
})

test('a skip from a later correction is not an initial skip receipt', () => {
  const skip: DoseAttempt = {
    ...attempt,
    payload: { scheduleId: 'schedule-1', dueAt: record.dueAt, outcome: 'Skipped' },
  }
  const skipped: DoseOutcomeRecord = {
    scheduleId: 'schedule-1',
    dueAt: record.dueAt,
    outcome: 'Skipped',
    recordedAt: record.takenAt,
    revision: 0,
  }
  expect(matchesDoseReceipt(skipped, skip)).toBe(true)
  expect(matchesDoseReceipt({ ...skipped, revision: 2 }, skip)).toBe(false)
})

test('correction receipt requires its action, next revision and intake details', () => {
  const correction: DoseAttempt = {
    ...attempt,
    method: 'PATCH',
    payload: { ...attempt.payload, expectedRevision: 2, actionId: attempt.id },
  }
  const receipt = { ...record, revision: 3, actionId: attempt.id }
  expect(matchesDoseReceipt(receipt, correction)).toBe(true)
  expect(matchesDoseReceipt({ ...receipt, actionId: 'someone-else' }, correction)).toBe(false)
  expect(matchesDoseReceipt({ ...receipt, revision: 4 }, correction)).toBe(false)
  expect(matchesDoseReceipt({ ...receipt, quantity: 1 }, correction)).toBe(false)
})
