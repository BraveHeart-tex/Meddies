import assert from 'node:assert/strict'
import { test } from 'vitest'
import { isTimeOfDay, joinTime, timeParts } from '../src/lib/time-of-day.ts'

test('a half-chosen time keeps the chosen half and stays distinguishable from empty', () => {
  assert.equal(joinTime({ hour: '', minute: '' }), '')
  assert.equal(joinTime({ hour: '08', minute: '' }), '08:')
  assert.equal(joinTime({ hour: '', minute: '15' }), ':15')
  assert.equal(joinTime({ hour: '08', minute: '15' }), '08:15')
  for (const value of ['', '08:', ':15', '08:15'])
    assert.equal(joinTime(timeParts(value)), value, value)
  assert.deepEqual(timeParts(':15'), { hour: '', minute: '15' })
})

test('only a complete 24-hour time counts as a time of day', () => {
  for (const value of ['00:00', '08:15', '23:59']) assert.equal(isTimeOfDay(value), true, value)
  for (const value of ['', '08:', ':15', '24:00', '08:60', '8:15'])
    assert.equal(isTimeOfDay(value), false, value)
})
