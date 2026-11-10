import { describe, expect, test } from 'vitest'
import { nextClockDoses } from '../src/features/schedules/clock-preview'

const istanbul = (local: string) => new Date(`${local}:00+03:00`).toISOString()
const EVERY_DAY = [0, 1, 2, 3, 4, 5, 6]

describe('nextClockDoses', () => {
  test('skips earlier times today and carries on into tomorrow', () => {
    const doses = nextClockDoses({
      weekdays: EVERY_DAY,
      times: ['20:00', '08:00', '14:00'],
      now: istanbul('2026-11-09T10:00'),
    })
    expect(doses).toEqual([
      istanbul('2026-11-09T14:00'),
      istanbul('2026-11-09T20:00'),
      istanbul('2026-11-10T08:00'),
    ])
  })

  test('skips days the schedule does not run on', () => {
    // Monday 9 November after the last time, on a Monday and Thursday schedule.
    const doses = nextClockDoses({
      weekdays: [1, 4],
      times: ['08:00'],
      now: istanbul('2026-11-09T21:00'),
    })
    expect(doses).toEqual([
      istanbul('2026-11-12T08:00'),
      istanbul('2026-11-16T08:00'),
      istanbul('2026-11-19T08:00'),
    ])
  })

  test('leaves a dose due exactly now with the earlier Schedule version', () => {
    const doses = nextClockDoses({
      weekdays: EVERY_DAY,
      times: ['10:00'],
      now: istanbul('2026-11-09T10:00'),
      count: 1,
    })
    expect(doses).toEqual([istanbul('2026-11-10T10:00')])
  })
})
