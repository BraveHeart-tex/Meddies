import assert from 'node:assert/strict'
import { test } from 'vitest'
import { outcomeConfirmation } from '../src/features/schedules/dose-confirmation.ts'

const key = { scheduleId: '6e0b55ee-2e10-4e00-80f2-a736c2f50f95' }
// 22:30 Istanbul on Thu 5 Nov 2026 is 19:30Z.
const dueAt = '2026-11-05T19:30:00.000Z'
const taken = (takenAt, quantity) => ({ ...key, dueAt, outcome: 'Taken', takenAt, quantity })
const skipped = { ...key, dueAt, outcome: 'Skipped', recordedAt: dueAt }

test('a skip says no intake was recorded', () => {
  assert.equal(
    outcomeConfirmation({
      label: 'Iron bisglycinate',
      unit: 'tablet',
      previous: 'Upcoming',
      record: skipped,
    }),
    'Iron bisglycinate 22:30 · saved as skipped',
  )
})

test('a new intake names its time and amount', () => {
  assert.equal(
    outcomeConfirmation({
      label: 'Melatonin',
      unit: 'tablet',
      previous: 'Due now',
      record: taken('2026-11-05T19:35:00.000Z', 1),
    }),
    'Melatonin 22:30 · taken at 22:35, 1 tablet',
  )
})

test('an edited intake after midnight names the actual day (C3, C5)', () => {
  assert.equal(
    outcomeConfirmation({
      label: 'Melatonin',
      unit: 'tablet',
      previous: 'Taken',
      record: taken('2026-11-05T20:00:00.000Z', 0.5),
    }),
    'Melatonin 22:30 · updated to taken at 23:00, ½ tablet',
  )
  assert.equal(
    outcomeConfirmation({
      label: 'Melatonin',
      unit: 'capsule',
      previous: 'Taken',
      record: taken('2026-11-05T21:15:00.000Z', 2),
    }),
    'Melatonin 22:30 · updated to taken at 00:15 on Fri 6 Nov, 2 capsules',
  )
})

test('a corrected outcome says what it changed to', () => {
  assert.equal(
    outcomeConfirmation({
      label: 'Melatonin',
      unit: 'tablet',
      previous: 'Skipped',
      record: taken('2026-11-05T19:30:00.000Z', 1.5),
    }),
    'Melatonin 22:30 · changed to taken at 22:30, 1½ tablets',
  )
  assert.equal(
    outcomeConfirmation({ label: 'Melatonin', unit: 'tablet', previous: 'Taken', record: skipped }),
    'Melatonin 22:30 · changed to skipped',
  )
})
