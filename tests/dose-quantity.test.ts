import assert from 'node:assert/strict'
import { test } from 'vitest'
import {
  parseQuantity,
  quantityLabel,
  quantityRule,
  stepQuantity,
  isDoseQuantity,
  isQuantityForUnit,
  quantityProblem,
} from '../src/lib/dose-quantity'

test('quantity text parses decimals and halves, and keeps blank apart from zero', () => {
  assert.equal(parseQuantity(''), null)
  assert.equal(parseQuantity('   '), null)
  assert.equal(parseQuantity('0'), 0)
  assert.equal(parseQuantity('1.5'), 1.5)
  assert.equal(parseQuantity('1,5'), 1.5)
  assert.equal(parseQuantity('1½'), 1.5)
  assert.equal(parseQuantity('½'), 0.5)
  assert.equal(parseQuantity('.5'), 0.5)
  assert.ok(Number.isNaN(parseQuantity('two')))
  assert.ok(Number.isNaN(parseQuantity('-1')))
  assert.ok(Number.isNaN(parseQuantity('1e2')))
})

test('labels always show the unit, with halves and plurals', () => {
  assert.equal(quantityLabel(0.5, 'tablet'), '½ tablet')
  assert.equal(quantityLabel(1, 'tablet'), '1 tablet')
  assert.equal(quantityLabel(1.5, 'tablet'), '1½ tablets')
  assert.equal(quantityLabel(2, 'capsule'), '2 capsules')
})

test('tablets step by half from a half; capsules step by one from one', () => {
  assert.deepEqual(quantityRule('tablet'), { step: 0.5, min: 0.5, initial: '1' })
  assert.deepEqual(quantityRule('capsule'), { step: 1, min: 1, initial: '1' })
  assert.equal(stepQuantity('1', 'tablet', 1), '1½')
  assert.equal(stepQuantity('1½', 'tablet', -1), '1')
  assert.equal(stepQuantity('½', 'tablet', -1), '½')
  assert.equal(stepQuantity('2', 'capsule', 1), '3')
  assert.equal(stepQuantity('1', 'capsule', -1), '1')
})

test('stepping from blank or invalid text starts at the minimum', () => {
  assert.equal(stepQuantity('', 'tablet', 1), '½')
  assert.equal(stepQuantity('abc', 'capsule', -1), '1')
  // Off-grid text snaps to the step grid in the pressed direction.
  assert.equal(stepQuantity('1.2', 'tablet', 1), '1½')
  assert.equal(stepQuantity('1.2', 'tablet', -1), '1')
  assert.equal(stepQuantity('1.5', 'capsule', 1), '2')
})

test('numeric policy keeps safe halves and unit rules with useful text errors', () => {
  for (const value of [null, '1', 0, -1, NaN, Infinity, 0.25, 4503599627370496])
    assert.equal(isDoseQuantity(value), false)
  assert.equal(isDoseQuantity(4503599627370495.5), true)
  assert.equal(isQuantityForUnit(4503599627370495.5, 'capsule'), false)
  assert.equal(isQuantityForUnit(4503599627370495, 'capsule'), true)
  for (const text of ['1,5', '1½', '½']) assert.equal(quantityProblem(text, 'tablet'), null)
  assert.equal(quantityProblem('', 'tablet'), 'Enter a quantity.')
  assert.equal(quantityProblem('0', 'tablet'), 'Use ½ tablet or more.')
  assert.equal(quantityProblem('0.25', 'tablet'), 'Use whole or half tablets.')
  assert.equal(quantityProblem('4503599627370496', 'tablet'), 'Enter a smaller quantity.')
  assert.equal(quantityProblem('4503599627370496', 'capsule'), 'Enter a smaller quantity.')
})
