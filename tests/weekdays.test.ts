import assert from 'node:assert/strict'
import { test } from 'vitest'
import { WEEK_ORDER, weekdaySummary } from '../src/features/schedules/weekdays'

test('the week reads Monday to Sunday', () => {
  assert.deepEqual(WEEK_ORDER, [1, 2, 3, 4, 5, 6, 0])
})

test('all seven days read "Every day" in either length', () => {
  assert.equal(weekdaySummary([0, 1, 2, 3, 4, 5, 6], 'short'), 'Every day')
  assert.equal(weekdaySummary([6, 5, 4, 3, 2, 1, 0], 'long'), 'Every day')
})

test('selected days list Monday first, whatever order they were stored in', () => {
  assert.equal(weekdaySummary([5, 1, 3], 'short'), 'Mon, Wed, Fri')
  assert.equal(weekdaySummary([0, 1], 'short'), 'Mon, Sun')
  assert.equal(weekdaySummary([0, 1], 'long'), 'Monday, Sunday')
})
