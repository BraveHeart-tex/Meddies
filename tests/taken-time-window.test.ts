import assert from 'node:assert/strict'
import { afterEach, beforeEach, test } from 'vitest'
import { isTakenTimeAllowed } from '../src/features/schedules/contract'

// The #275 Taken time window, shared by the Worker and the Taken form. Istanbul is UTC+3, and a
// device far west of it must not shift the dates. Catches a window keyed to UTC or device dates.
let previousTz: string | undefined
beforeEach(() => {
  previousTz = process.env.TZ
  process.env.TZ = 'America/Los_Angeles'
})
afterEach(() => {
  if (previousTz === undefined) delete process.env.TZ
  else process.env.TZ = previousTz
})

const istanbul = (local: string) => new Date(`${local}+03:00`).toJSON()

test('From History: the due day and the days either side are accepted, two days off rejected', () => {
  const dueAt = istanbul('2026-11-10T08:00')
  const now = new Date(istanbul('2026-11-14T12:00'))
  for (const local of ['2026-11-09T00:00', '2026-11-10T08:30', '2026-11-11T23:59'])
    assert.equal(isTakenTimeAllowed(istanbul(local), dueAt, now), true, local)
  // Outside the window: the #275 example, and the minutes just past each edge.
  for (const local of ['2026-11-12T08:30', '2026-11-12T00:00', '2026-11-08T23:59'])
    assert.equal(isTakenTimeAllowed(istanbul(local), dueAt, now), false, local)
})

test('Day before: a dose just after midnight accepts a time late the previous day', () => {
  const dueAt = istanbul('2026-11-14T00:15')
  const now = new Date(istanbul('2026-11-14T00:20'))
  // Both are Nov 13 in UTC and in Los Angeles; only Istanbul dates make this the day before.
  assert.equal(isTakenTimeAllowed(istanbul('2026-11-13T23:50'), dueAt, now), true)
  assert.equal(isTakenTimeAllowed(istanbul('2026-11-12T23:59'), dueAt, now), false)
})

test('a time after now is rejected even inside the window', () => {
  const dueAt = istanbul('2026-11-14T09:00')
  const now = new Date(istanbul('2026-11-14T09:30'))
  assert.equal(isTakenTimeAllowed(now.toJSON(), dueAt, now), true)
  assert.equal(isTakenTimeAllowed(istanbul('2026-11-14T09:31'), dueAt, now), false)
  assert.equal(isTakenTimeAllowed(istanbul('2026-11-15T08:00'), dueAt, now), false)
})
