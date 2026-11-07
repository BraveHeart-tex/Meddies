import assert from 'node:assert/strict'
import { test } from 'vitest'
import { anchoredClock } from '../src/features/schedules/anchored-clock.ts'

function fakeMonotonic(start = 1000) {
  let value = start
  return { read: () => value, advance: (ms) => (value += ms) }
}

test('reads the server now unchanged until time elapses', () => {
  const monotonic = fakeMonotonic()
  const clock = anchoredClock('2035-06-15T06:00:00.000Z', monotonic.read)
  assert.equal(clock.now().toISOString(), '2035-06-15T06:00:00.000Z')
})

test('advances the server now by monotonic elapsed time, not the wall clock', () => {
  const monotonic = fakeMonotonic()
  const clock = anchoredClock('2035-06-15T06:00:00.000Z', monotonic.read)
  monotonic.advance(90_500)
  assert.equal(clock.now().toISOString(), '2035-06-15T06:01:30.500Z')
})

test('rejects a server now that is not an instant', () => {
  assert.throws(() => anchoredClock('not a time', () => 0), RangeError)
})
