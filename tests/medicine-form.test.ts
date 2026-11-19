import assert from 'node:assert/strict'
import { test } from 'vitest'
import { parseMedicine } from '../src/features/medicines/contract'
import {
  medicineFormDefaults,
  medicineFormSchema,
} from '../src/features/medicines/medicine-form-schema'

const id = '6e0b55ee-2e10-4e00-80f2-a736c2f50f95'

const errorsOf = (values: unknown) => {
  const result = medicineFormSchema.safeParse(values)
  return result.success
    ? {}
    : Object.fromEntries(result.error.issues.map((issue) => [issue.path[0], issue.message]))
}

test('blank defaults ask for a name and a unit, with nothing preselected', () => {
  assert.deepEqual(medicineFormDefaults, { label: '', strength: '', unit: '', stock: '' })
  assert.deepEqual(errorsOf(medicineFormDefaults), {
    label: 'Enter the medication name.',
    unit: 'Choose a type.',
  })
})

test('valid values trim to what the server contract stores', () => {
  const values = { label: '  Magnesium ', strength: ' 200 mg ', unit: 'capsule', stock: '' }
  const parsed = medicineFormSchema.parse(values)
  assert.deepEqual(parsed, { label: 'Magnesium', strength: '200 mg', unit: 'capsule' })
  assert.deepEqual(parseMedicine({ id, ...parsed }), { id, ...parsed })
})

test('blank strength is optional and becomes null, as on the server', () => {
  assert.deepEqual(
    medicineFormSchema.parse({ label: 'Iron', strength: '   ', unit: 'tablet', stock: '' }),
    {
      label: 'Iron',
      strength: null,
      unit: 'tablet',
    },
  )
})

test('length limits apply after trimming, matching the server', () => {
  const at = 'x'.repeat(120)
  const over = 'x'.repeat(121)
  for (const values of [
    { label: ` ${at} `, strength: ` ${at} `, unit: 'tablet', stock: '' },
    { label: over, strength: '', unit: 'tablet', stock: '' },
    { label: 'Iron', strength: over, unit: 'tablet', stock: '' },
    { label: '   ', strength: '', unit: 'tablet', stock: '' },
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
  assert.deepEqual(errorsOf({ label: over, strength: over, unit: 'tablet', stock: '' }), {
    label: 'Use 120 characters or fewer.',
    strength: 'Use 120 characters or fewer.',
  })
})

const capsules = { label: 'Omega-3', strength: '', unit: 'capsule' }

// Regression: a count off the chosen Type's grid saving, or a valid one blocked after a Type change.
test('the Stock count validates against the Type chosen at save', () => {
  assert.deepEqual(errorsOf({ ...capsules, stock: '7.5' }), { stock: 'Use whole capsules.' })
  assert.deepEqual(medicineFormSchema.parse({ ...capsules, unit: 'tablet', stock: '7.5' }), {
    ...capsules,
    strength: null,
    unit: 'tablet',
    startingCount: 7.5,
  })
  assert.deepEqual(errorsOf({ ...capsules, unit: 'liquid', stock: '1.25' }), {
    stock: 'Use steps of 0.1 ml, like 1.2 ml.',
  })
  assert.deepEqual(errorsOf({ ...capsules, stock: 'lots' }), { stock: 'Enter a number, like 30.' })
  assert.deepEqual(errorsOf({ ...capsules, stock: '-3' }), { stock: 'Enter a number, like 30.' })
})

test('an empty Stock count keeps stock off; zero and a count turn it on', () => {
  assert.equal('startingCount' in medicineFormSchema.parse({ ...capsules, stock: '  ' }), false)
  for (const [stock, startingCount] of [
    ['0', 0],
    ['28', 28],
  ] as const) {
    const parsed = medicineFormSchema.parse({ ...capsules, stock })
    assert.equal(parsed.startingCount, startingCount)
    assert.equal(parseMedicine({ id, ...parsed }).startingCount, startingCount)
  }
})
