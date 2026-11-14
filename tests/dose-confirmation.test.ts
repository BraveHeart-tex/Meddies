import type { DoseRecord, SkippedDoseRecord } from '../src/features/schedules/contract'
import assert from 'node:assert/strict'
import { test } from 'vitest'
import { outcomeConfirmation } from '../src/features/schedules/dose-confirmation'

const key = { scheduleId: '6e0b55ee-2e10-4e00-80f2-a736c2f50f95' }
// 22:30 Istanbul on Thu 5 Nov 2026 is 19:30Z.
const dueAt = '2026-11-05T19:30:00.000Z'
const taken = (takenAt: string, quantity: number): DoseRecord => ({
  ...key,
  dueAt,
  outcome: 'Taken',
  takenAt,
  quantity,
})
const skipped: SkippedDoseRecord = { ...key, dueAt, outcome: 'Skipped', recordedAt: dueAt }
const confirm = (
  args: Omit<Parameters<typeof outcomeConfirmation>[0], 'today'> & { today?: string },
) => outcomeConfirmation({ today: '2026-11-05', ...args })

test('a skip says no intake was recorded', () => {
  assert.equal(
    confirm({
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
    confirm({
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
    confirm({
      label: 'Melatonin',
      unit: 'tablet',
      previous: 'Taken',
      record: taken('2026-11-05T20:00:00.000Z', 0.5),
    }),
    'Melatonin 22:30 · updated to taken at 23:00, ½ tablet',
  )
  assert.equal(
    confirm({
      label: 'Melatonin',
      unit: 'capsule',
      previous: 'Taken',
      record: taken('2026-11-05T21:15:00.000Z', 2),
    }),
    'Melatonin 22:30 · updated to taken at 00:15 on Fri 6 Nov, 2 capsules',
  )
})

// Catches an amount-only change reading as a change of time (#283).
test('an amount-only change names the new amount', () => {
  assert.equal(
    confirm({
      label: 'Melatonin',
      unit: 'tablet',
      previous: 'Taken',
      previousTakenAt: '2026-11-05T19:35:00.000Z',
      record: taken('2026-11-05T19:35:00.000Z', 1),
    }),
    'Melatonin 22:30 · now 1 tablet',
  )
  assert.equal(
    confirm({
      label: 'Melatonin',
      unit: 'tablet',
      previous: 'Taken',
      previousTakenAt: '2026-11-05T19:30:00.000Z',
      record: taken('2026-11-05T19:35:00.000Z', 1),
    }),
    'Melatonin 22:30 · updated to taken at 22:35, 1 tablet',
  )
})

test('a corrected outcome says what it changed to', () => {
  assert.equal(
    confirm({
      label: 'Melatonin',
      unit: 'tablet',
      previous: 'Skipped',
      record: taken('2026-11-05T19:30:00.000Z', 1.5),
    }),
    'Melatonin 22:30 · changed to taken at 22:30, 1½ tablets',
  )
  assert.equal(
    confirm({ label: 'Melatonin', unit: 'tablet', previous: 'Taken', record: skipped }),
    'Melatonin 22:30 · changed to skipped',
  )
})

test('the year of an intake on another day follows the current Istanbul year', () => {
  const record: DoseRecord = {
    ...key,
    outcome: 'Taken',
    // 23:00 on 31 Dec 2035, taken 00:15 on 1 Jan 2036 in Istanbul.
    dueAt: '2035-12-31T20:00:00.000Z',
    takenAt: '2035-12-31T21:15:00.000Z',
    quantity: 1,
  }
  const args: Omit<Parameters<typeof outcomeConfirmation>[0], 'today'> = {
    label: 'Melatonin',
    unit: 'tablet',
    previous: 'Due now',
    record,
  }
  assert.equal(
    confirm({ ...args, today: '2036-01-01' }),
    'Melatonin 23:00 on Mon 31 Dec 2035 · taken at 00:15 on Tue 1 Jan, 1 tablet',
  )
  assert.equal(
    confirm({ ...args, today: '2035-12-31' }),
    'Melatonin 23:00 · taken at 00:15 on Tue 1 Jan 2036, 1 tablet',
  )
})

test('a dose due on another day names its due day (#278)', () => {
  assert.equal(
    confirm({
      label: 'Melatonin',
      unit: 'tablet',
      previous: 'Not logged',
      record: skipped,
      today: '2026-11-09',
    }),
    'Melatonin 22:30 on Thu 5 Nov · saved as skipped',
  )
  assert.equal(
    confirm({
      label: 'Melatonin',
      unit: 'tablet',
      previous: 'Not logged',
      record: taken('2026-11-05T21:15:00.000Z', 1),
      today: '2026-11-09',
    }),
    'Melatonin 22:30 on Thu 5 Nov · taken at 00:15 on Fri 6 Nov, 1 tablet',
  )
})
