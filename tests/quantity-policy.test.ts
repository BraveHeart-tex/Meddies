import assert from 'node:assert/strict'
import { test } from 'vitest'
import {
  countedEntry,
  formatQuantity,
  isDoseQuantity,
  isMedicineType,
  isQuantityFor,
  isWritableMedicineType,
  isWritableQuantity,
  medicineTypeLabel,
  medicineTypeOptions,
  strengthHelp,
  parseQuantity,
  quantityLabel,
  quantityProblem,
  quantityRule,
  stepQuantity,
  unitName,
  writableMedicineTypes,
} from '../src/lib/quantity-policy'

const nbsp = '\u00a0'
// 265·S2, S5: a counted unit #267 builds on, never registered as a production Type.
const puff = countedEntry('Inhaler', 'puff', 'puffs')

test('Types: the menu lists every writable Type in order, with Strength help per Type', () => {
  assert.deepEqual(medicineTypeOptions, [
    { value: 'tablet', label: 'Tablet' },
    { value: 'capsule', label: 'Capsule' },
    { value: 'liquid', label: 'Liquid' },
  ])
  const pack = 'On the pack, e.g. 200 mg. Not your dose amount.'
  for (const type of [null, 'tablet', 'capsule'] as const) assert.equal(strengthHelp(type), pack)
  assert.equal(strengthHelp('liquid'), 'On the bottle, e.g. 250 mg/5 ml. Not your dose amount.')
  assert.deepEqual(writableMedicineTypes, ['tablet', 'capsule', 'liquid'])
  for (const type of ['tablet', 'capsule', 'liquid']) assert.equal(isMedicineType(type), true)
  for (const type of ['ml', 'puff', 'inhaler', 'drops', 'injection', '', null])
    assert.equal(isMedicineType(type), false)
  assert.equal(isWritableMedicineType('liquid'), true)
  assert.equal(medicineTypeLabel('liquid'), 'Liquid')
})

test('quantity text parses decimals, commas and halves, and keeps blank apart from zero', () => {
  assert.equal(parseQuantity(''), null)
  assert.equal(parseQuantity('   '), null)
  assert.equal(parseQuantity('0'), 0)
  assert.equal(parseQuantity('1.5'), 1.5)
  assert.equal(parseQuantity('1,5'), 1.5)
  assert.equal(parseQuantity('0,3'), 0.3)
  assert.equal(parseQuantity('1½'), 1.5)
  assert.equal(parseQuantity('½'), 0.5)
  assert.equal(parseQuantity('.5'), 0.5)
  assert.ok(Number.isNaN(parseQuantity('two')))
  assert.ok(Number.isNaN(parseQuantity('-1')))
  assert.ok(Number.isNaN(parseQuantity('1e2')))
})

test('every amount label joins number and unit with a no-break space', () => {
  assert.equal(quantityLabel(0.5, 'tablet'), `½${nbsp}tablet`)
  assert.equal(quantityLabel(1, 'tablet'), `1${nbsp}tablet`)
  assert.equal(quantityLabel(1.5, 'tablet'), `1½${nbsp}tablets`)
  assert.equal(quantityLabel(1, 'capsule'), `1${nbsp}capsule`)
  assert.equal(quantityLabel(2, 'capsule'), `2${nbsp}capsules`)
  for (const [value, text] of [
    [0.1, '0.1'],
    [0.3, '0.3'],
    [0.5, '0.5'],
    [1, '1'],
    [1.5, '1.5'],
    [12, '12'],
  ] as const)
    assert.equal(quantityLabel(value, 'liquid'), `${text}${nbsp}ml`)
  assert.equal(unitName(null, 'liquid'), 'ml')
  assert.equal(unitName(null, 'tablet'), 'tablets')
  assert.equal(formatQuantity(0.5, 'liquid'), '0.5')
  assert.equal(formatQuantity(0.5, 'tablet'), '½')
})

test('rules: steps, minimums and new dose amounts per Type', () => {
  assert.deepEqual(quantityRule('tablet'), { step: 0.5, min: 0.5, initial: '1' })
  assert.deepEqual(quantityRule('capsule'), { step: 1, min: 1, initial: '1' })
  assert.deepEqual(quantityRule('liquid'), { step: 0.1, min: 0.1, initial: '1' })
})

test('stepping snaps to the grid, never below the minimum, and starts there from blank', () => {
  assert.equal(stepQuantity('1', 'tablet', 1), '1½')
  assert.equal(stepQuantity('1½', 'tablet', -1), '1')
  assert.equal(stepQuantity('½', 'tablet', -1), '½')
  assert.equal(stepQuantity('2', 'capsule', 1), '3')
  assert.equal(stepQuantity('1', 'capsule', -1), '1')
  assert.equal(stepQuantity('', 'tablet', 1), '½')
  assert.equal(stepQuantity('abc', 'capsule', -1), '1')
  assert.equal(stepQuantity('1.2', 'tablet', 1), '1½')
  assert.equal(stepQuantity('1.2', 'tablet', -1), '1')
  assert.equal(stepQuantity('1.5', 'capsule', 1), '2')
  // Liquid: exact tenths, no float drift.
  assert.equal(stepQuantity('0.2', 'liquid', 1), '0.3')
  assert.equal(stepQuantity('0.6', 'liquid', 1), '0.7')
  assert.equal(stepQuantity('1', 'liquid', -1), '0.9')
  assert.equal(stepQuantity('1,4', 'liquid', 1), '1.5')
  assert.equal(stepQuantity('0.1', 'liquid', -1), '0.1')
  assert.equal(stepQuantity('', 'liquid', 1), '0.1')
  assert.equal(stepQuantity('1.25', 'liquid', 1), '1.3')
  assert.equal(stepQuantity('1.25', 'liquid', -1), '1.2')
})

test('Tablet and Capsule validation keeps its safe halves and errors', () => {
  for (const value of [null, '1', 0, -1, NaN, Infinity, 0.25, 4503599627370496])
    assert.equal(isDoseQuantity(value), false)
  assert.equal(isDoseQuantity(4503599627370495.5), true)
  assert.equal(isQuantityFor(4503599627370495.5, 'capsule'), false)
  assert.equal(isQuantityFor(4503599627370495, 'capsule'), true)
  for (const text of ['1,5', '1½', '½']) assert.equal(quantityProblem(text, 'tablet'), null)
  assert.equal(quantityProblem('', 'tablet'), 'Enter a quantity.')
  assert.equal(quantityProblem('0', 'tablet'), 'Use ½ tablet or more.')
  assert.equal(quantityProblem('0.25', 'tablet'), 'Use whole or half tablets.')
  assert.equal(quantityProblem('4503599627370496', 'tablet'), 'Enter a smaller quantity.')
  assert.equal(quantityProblem('0', 'capsule'), 'Use 1 capsule or more.')
  assert.equal(quantityProblem('1.5', 'capsule'), 'Use whole capsules.')
  assert.equal(quantityProblem('4503599627370496', 'capsule'), 'Enter a smaller quantity.')
})

test('Liquid validation: tenths of ml with the 265·S1 errors', () => {
  for (const text of ['0.1', '0.3', '0,5', '1.5', '12.7'])
    assert.equal(quantityProblem(text, 'liquid'), null)
  for (const value of [0.1, 0.3, 0.5, 0.7, 1.5, 900719925474099])
    assert.equal(isQuantityFor(value, 'liquid'), true)
  for (const value of [0, -0.1, 0.05, 1.25, 900719925474100, NaN, '0.5'])
    assert.equal(isQuantityFor(value, 'liquid'), false)
  assert.equal(quantityProblem('', 'liquid'), 'Enter a quantity.')
  assert.equal(quantityProblem('0', 'liquid'), 'Use 0.1 ml or more.')
  assert.equal(quantityProblem('1.25', 'liquid'), 'Use steps of 0.1 ml, like 1.2 ml.')
  assert.equal(quantityProblem('0.05', 'liquid'), 'Use steps of 0.1 ml, like 1.2 ml.')
  assert.equal(quantityProblem('900719925474100', 'liquid'), 'Enter a smaller quantity.')
})

test('writes accept Liquid amounts and keep unsupported Types rejected', () => {
  assert.equal(isWritableQuantity(1, 'tablet'), true)
  assert.equal(isWritableQuantity(1.5, 'liquid'), true)
  for (const type of ['inhaler', 'drops', 'injection', 'puff', 'unknown'])
    assert.equal(isWritableQuantity(1, type), false)
  assert.equal(isWritableQuantity(1, undefined), false)
  assert.equal(isDoseQuantity(0.3), true)
  assert.equal(isDoseQuantity(0.3, 'read'), true)
  assert.equal(isDoseQuantity(1.25, 'read'), false)
})

test('a counted entry: whole puffs from 1, singular and plural wording (265·S2, S5)', () => {
  assert.deepEqual(quantityRule(puff), { step: 1, min: 1, initial: '1' })
  assert.equal(quantityLabel(1, puff), `1${nbsp}puff`)
  assert.equal(quantityLabel(2, puff), `2${nbsp}puffs`)
  assert.equal(stepQuantity('1', puff, -1), '1')
  assert.equal(stepQuantity('1', puff, 1), '2')
  assert.equal(quantityProblem('2', puff), null)
  assert.equal(quantityProblem('1.5', puff), 'Use whole puffs.')
  assert.equal(quantityProblem('0', puff), 'Use 1 puff or more.')
  assert.equal(isMedicineType('puff'), false)
  assert.equal(isMedicineType('inhaler'), false)
  assert.ok(medicineTypeOptions.every((option) => option.label !== 'Inhaler'))
})
