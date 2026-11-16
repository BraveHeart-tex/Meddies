import assert from 'node:assert/strict'
import { test } from 'vitest'
import {
  parseMedicineRecord,
  parseMedicineResponse,
  type MedicineRecord,
} from '../src/features/medicines/contract'
import { mergeMedicines, withSavedMedicine } from '../src/features/medicines/queries'
import { parseDoseOutcomeRecord } from '../src/features/schedules/contract'
import { parseUnscheduledDoseRecord } from '../src/features/unscheduled-doses/contract'

const id = '00000000-0000-4000-8000-000000000001'
const actionId = '00000000-0000-4000-8000-000000000002'
const medicine: MedicineRecord = {
  id,
  label: 'Example',
  strength: '400 mg',
  unit: 'tablet',
  revision: 1,
  lastActionId: actionId,
  currentStrengthRevisionId: actionId,
  everHadSchedule: true,
  everHadDose: true,
  latestTakenAt: '2026-11-05T06:00:00.000Z',
  archivedAt: null,
  strengthRevisions: [
    {
      id,
      strength: '250 mg',
      label: 'Earlier',
      unit: 'tablet',
      effectiveAt: '0001-01-01T00:00:00.000Z',
      previousValues: [{ strength: '200 mg', label: 'Earlier', unit: 'tablet' }],
    },
    {
      id: actionId,
      strength: '400 mg',
      label: 'Example',
      unit: 'tablet',
      effectiveAt: '2026-11-05T06:00:00.000Z',
      previousValues: [],
    },
  ],
}

test('runtime contracts retain revision previews, export values and scheduled and Unscheduled snapshots', () => {
  assert.deepEqual(parseMedicineResponse(medicine), medicine)
  for (const patch of [
    { revision: -1 },
    { currentStrengthRevisionId: id + 'x' },
    { everHadDose: 'true' },
    { lastActionId: 'bad' },
    { strengthRevisions: [{ ...medicine.strengthRevisions[0], effectiveAt: 'tomorrow' }] },
  ])
    assert.throws(() => parseMedicineRecord({ ...medicine, ...patch }), /validation/)
  const snapshot = {
    strengthRevisionId: id,
    strength: '250 mg',
    medicineLabel: 'Earlier',
    unit: 'tablet',
  }
  const taken = {
    scheduleId: id,
    dueAt: '2026-11-05T06:00:00.000Z',
    takenAt: '2026-11-05T05:55:00.000Z',
    quantity: 1,
    outcome: 'Taken',
    ...snapshot,
  }
  assert.deepEqual(parseDoseOutcomeRecord(taken), taken)
  const unscheduled = {
    id,
    actionId,
    medicineId: id,
    takenAt: taken.takenAt,
    quantity: 1,
    outcome: 'Taken',
    revision: 0,
    removed: false,
    ...snapshot,
  }
  assert.deepEqual(parseUnscheduledDoseRecord(unscheduled), unscheduled)
  assert.throws(() => parseDoseOutcomeRecord({ ...taken, strengthRevisionId: 'bad' }), /validation/)
  const legacy = { id, label: 'Example', strength: null, unit: 'tablet' }
  assert.deepEqual(parseMedicineResponse(legacy), legacy)
})

test('stale reads and initial-save receipts cannot overwrite a newer medication revision', () => {
  const stale = { ...medicine, revision: 0, strength: '200 mg' }
  assert.deepEqual(mergeMedicines([medicine], [stale]), [medicine])
  assert.deepEqual(withSavedMedicine([medicine], stale), [medicine])
  assert.deepEqual(
    mergeMedicines(
      [medicine],
      [{ ...medicine, everHadDose: false, everHadSchedule: false, latestTakenAt: null }],
    ),
    [medicine],
  )
})
