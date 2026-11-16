import assert from 'node:assert/strict'
import { test } from 'vitest'
import {
  parseDetailCorrection,
  parseMedicine,
  parseMedicineRecord,
  parseMedicineResponse,
} from '../src/features/medicines/contract'
import {
  parseDoseCorrection,
  parseDoseOutcomeRecord,
  parseSchedule,
  parseTakenDose,
} from '../src/features/schedules/contract'
import {
  parseUnscheduledDose,
  parseUnscheduledDoseChange,
  parseUnscheduledDoseRecord,
} from '../src/features/unscheduled-doses/contract'

// Liquid reads ship before writes (#266, #335); unsupported Types stay rejected.
const id = '00000000-0000-4000-8000-000000000001'
const actionId = '00000000-0000-4000-8000-000000000002'
const liquid = { id, label: 'Amoxicillin', strength: '250 mg/5 ml', unit: 'liquid' }
const record = {
  ...liquid,
  revision: 1,
  lastActionId: actionId,
  currentStrengthRevisionId: id,
  everHadSchedule: true,
  everHadDose: true,
  latestTakenAt: null,
  archivedAt: null,
  strengthRevisions: [{ ...liquid, effectiveAt: '0001-01-01T00:00:00.000Z', previousValues: [] }],
}
const schedule = {
  id,
  medicineId: id,
  startDate: '2026-11-16',
  times: [{ time: '08:00', quantity: 0.3 }],
}
const taken = {
  scheduleId: id,
  dueAt: '2026-11-16T05:00:00.000Z',
  takenAt: '2026-11-16T05:05:00.000Z',
  quantity: 1.5,
}
const unscheduled = { actionId, medicineId: id, takenAt: taken.takenAt, quantity: 0.3 }

test('read contracts accept a Liquid Medicine and decimal ml amounts', () => {
  assert.deepEqual(parseMedicineRecord(record), record)
  assert.deepEqual(parseMedicineResponse(liquid), liquid)
  assert.deepEqual(parseSchedule(schedule, 'read').times, schedule.times)
  assert.deepEqual(parseDoseOutcomeRecord({ ...taken, outcome: 'Taken' }), {
    ...taken,
    outcome: 'Taken',
  })
  const dose = { ...unscheduled, id, outcome: 'Taken', revision: 0, removed: false }
  assert.deepEqual(parseUnscheduledDoseRecord(dose), dose)
  for (const quantity of [0.05, 1.25])
    assert.throws(() =>
      parseSchedule({ ...schedule, times: [{ time: '08:00', quantity }] }, 'read'),
    )
})

test('write contracts accept Liquid but reject Inhaler, Drops, unknown Types and the test-only unit', () => {
  assert.equal(parseMedicine({ ...liquid, unit: 'capsule' }).unit, 'capsule')
  assert.equal(parseMedicine(liquid).unit, 'liquid')
  for (const unit of ['ml', 'inhaler', 'puff', 'drops', 'injection', undefined]) {
    assert.throws(() => parseMedicine({ ...liquid, unit }), /validation/)
    assert.throws(
      () =>
        parseDetailCorrection({
          actionId,
          medicineId: id,
          expectedRevision: 1,
          strengthRevisionId: id,
          label: 'Amoxicillin',
          strength: null,
          unit,
        }),
      /validation/,
    )
  }
})

test('write contracts accept tenths for Liquid on every quantity write and reject invalid amounts', () => {
  const correction = {
    ...taken,
    actionId,
    expectedRevision: 0,
    expectedOutcome: 'Taken',
    outcome: 'Taken',
  }
  const change = {
    actionId,
    doseId: id,
    expectedRevision: 0,
    removed: false,
    takenAt: taken.takenAt,
    quantity: 0.3,
  }
  assert.equal(
    parseDetailCorrection({
      ...liquid,
      actionId,
      medicineId: id,
      expectedRevision: 0,
      strengthRevisionId: id,
    }).unit,
    'liquid',
  )
  for (const quantity of [0.1, 0.3, 0.5, 1.5]) {
    assert.equal(
      parseSchedule({ ...schedule, times: [{ time: '08:00', quantity }] }).times[0].quantity,
      quantity,
    )
    assert.equal(parseTakenDose({ ...taken, quantity }).quantity, quantity)
    const parsedCorrection = parseDoseCorrection({ ...correction, quantity })
    assert.ok('quantity' in parsedCorrection)
    assert.equal(parsedCorrection.quantity, quantity)
    assert.equal(parseUnscheduledDose({ ...unscheduled, quantity }).quantity, quantity)
    const parsedChange = parseUnscheduledDoseChange({ ...change, quantity })
    assert.ok('quantity' in parsedChange)
    assert.equal(parsedChange.quantity, quantity)
  }
  for (const quantity of [0.05, 1.25, 0, -0.1, Number.MAX_SAFE_INTEGER]) {
    for (const parse of [
      () => parseSchedule({ ...schedule, times: [{ time: '08:00', quantity }] }),
      () => parseTakenDose({ ...taken, quantity }),
      () => parseDoseCorrection({ ...correction, quantity }),
      () => parseUnscheduledDose({ ...unscheduled, quantity }),
      () => parseUnscheduledDoseChange({ ...change, quantity }),
    ])
      assert.throws(parse, /validation/)
  }
})
