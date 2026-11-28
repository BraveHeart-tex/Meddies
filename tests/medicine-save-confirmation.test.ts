import { expect, test } from 'vitest'
import { type MedicineInput, type MedicineRecord } from '../src/features/medicines/contract'
import {
  confirmMedicineResponse,
  reconcileMedicineSave,
} from '../src/features/medicines/medicine-save-confirmation'

const medicine = {
  id: '10000000-0000-4000-8000-000000000001',
  label: 'Test Medicine',
  strength: '5 mg',
  unit: 'capsule',
} satisfies MedicineInput

const otherId = '10000000-0000-4000-8000-000000000002'
const strengthRevisionId = '10000000-0000-4000-8000-000000000003'
const record: MedicineRecord = {
  ...medicine,
  revision: 1,
  lastActionId: null,
  currentStrengthRevisionId: strengthRevisionId,
  strengthRevisions: [
    {
      id: strengthRevisionId,
      label: medicine.label,
      strength: medicine.strength,
      unit: medicine.unit,
      effectiveAt: '2026-11-19T12:00:00.000Z',
      previousValues: [],
    },
  ],
  everHadSchedule: false,
  everHadDose: false,
  latestTakenAt: null,
  archivedAt: null,
  stock: { tracked: true, count: 28 },
}
const trackedAttempt: MedicineInput = { ...medicine, startingCount: 28 }

test.each([
  ['a different ID', { medicines: [{ ...medicine, id: otherId }] }],
  ['a different label', { medicines: [{ ...medicine, label: 'Other Medicine' }] }],
  ['a different Strength', { medicines: [{ ...medicine, strength: '10 mg' }] }],
  ['a different Quantity unit', { medicines: [{ ...medicine, unit: 'tablet' }] }],
  ['an empty envelope', {}],
  ['an empty Medicines array', { medicines: [] }],
  ['a malformed record', { medicines: [{}] }],
])('a POST confirmation rejects %s', (_case, envelope) => {
  expect(() => confirmMedicineResponse(envelope, medicine)).toThrow()
})

test.each([
  ['no matching ID', { ...record, id: otherId }],
  ['a different label', { ...record, label: 'Other Medicine' }],
  ['a different Strength', { ...record, strength: '10 mg' }],
  ['a different Quantity unit', { ...record, unit: 'tablet' as const }],
])('a reconciling read rejects %s', (_case, entry) => {
  expect(() => reconcileMedicineSave([entry], medicine)).toThrow()
})

test.each([
  ['tracking off', { tracked: false }],
  ['a different count', { tracked: true, count: 27 }],
] satisfies [string, MedicineRecord['stock']][])(
  'a full record with %s cannot confirm Add with a starting count',
  (_case, stock) => {
    const saved = { ...record, stock }
    expect(() => confirmMedicineResponse({ medicines: [saved] }, trackedAttempt)).toThrow()
    expect(() => reconcileMedicineSave([saved], trackedAttempt)).toThrow()
  },
)

test('a matching POST summary confirms the Medicine even without Stock details', () => {
  expect(confirmMedicineResponse({ medicines: [medicine] }, trackedAttempt)).toEqual(medicine)
})

test('a matching full record with the exact tracked count confirms the Medicine', () => {
  expect(confirmMedicineResponse({ medicines: [record] }, trackedAttempt)).toEqual(record)
  expect(reconcileMedicineSave([{ ...record, id: otherId }, record], trackedAttempt)).toEqual(
    record,
  )
})
