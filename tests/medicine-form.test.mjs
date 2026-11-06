import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseMedicine } from '../src/features/medicines/contract.ts'
import {
  medicineFormDefaults,
  medicineFormSchema,
} from '../src/features/medicines/medicine-form-schema.ts'

const id = '6e0b55ee-2e10-4e00-80f2-a736c2f50f95'

const errorsOf = (values) => {
  const result = medicineFormSchema.safeParse(values)
  return result.success
    ? {}
    : Object.fromEntries(result.error.issues.map((issue) => [issue.path[0], issue.message]))
}

test('blank defaults ask for a name and a unit, with nothing preselected', () => {
  assert.deepEqual(medicineFormDefaults, { label: '', strength: '', unit: '' })
  assert.deepEqual(errorsOf(medicineFormDefaults), {
    label: 'Enter the medicine name.',
    unit: 'Choose tablet or capsule.',
  })
})

test('valid values trim to what the server contract stores', () => {
  const values = { label: '  Magnesium ', strength: ' 200 mg ', unit: 'capsule' }
  const parsed = medicineFormSchema.parse(values)
  assert.deepEqual(parsed, { label: 'Magnesium', strength: '200 mg', unit: 'capsule' })
  assert.deepEqual(parseMedicine({ id, ...values }), { id, ...parsed })
})

test('blank strength is optional and becomes null, as on the server', () => {
  assert.deepEqual(medicineFormSchema.parse({ label: 'Iron', strength: '   ', unit: 'tablet' }), {
    label: 'Iron',
    strength: null,
    unit: 'tablet',
  })
})

test('length limits apply after trimming, matching the server', () => {
  const at = 'x'.repeat(120)
  const over = 'x'.repeat(121)
  for (const values of [
    { label: ` ${at} `, strength: ` ${at} `, unit: 'tablet' },
    { label: over, strength: '', unit: 'tablet' },
    { label: 'Iron', strength: over, unit: 'tablet' },
    { label: '   ', strength: '', unit: 'tablet' },
  ]) {
    const client = medicineFormSchema.safeParse(values).success
    let server = true
    try {
      parseMedicine({ id, ...values })
    } catch {
      server = false
    }
    assert.equal(client, server, JSON.stringify(values))
  }
  assert.deepEqual(errorsOf({ label: over, strength: over, unit: 'tablet' }), {
    label: 'Use 120 characters or fewer.',
    strength: 'Use 120 characters or fewer.',
  })
})
