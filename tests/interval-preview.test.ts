import { describe, expect, test } from 'vitest'
import {
  intervalOvernightNote,
  nextIntervalDoses,
} from '../src/features/schedules/interval-preview'

const istanbul = (local: string) => new Date(`${local}:00+03:00`).toISOString()

describe('nextIntervalDoses', () => {
  test('skips an Anchor earlier today and shows the first real dose', () => {
    const doses = nextIntervalDoses({
      anchor: istanbul('2026-11-09T08:00'),
      hours: 8,
      now: istanbul('2026-11-09T10:00'),
    })
    expect(doses).toEqual([
      istanbul('2026-11-09T16:00'),
      istanbul('2026-11-10T00:00'),
      istanbul('2026-11-10T08:00'),
    ])
  })

  test('includes a future Anchor as the first dose', () => {
    const doses = nextIntervalDoses({
      anchor: istanbul('2026-11-09T12:00'),
      hours: 4,
      now: istanbul('2026-11-09T10:00'),
    })
    expect(doses).toEqual([
      istanbul('2026-11-09T12:00'),
      istanbul('2026-11-09T16:00'),
      istanbul('2026-11-09T20:00'),
    ])
  })

  test('expects no dose at an Anchor equal to now', () => {
    const doses = nextIntervalDoses({
      anchor: istanbul('2026-11-09T10:00'),
      hours: 24,
      now: istanbul('2026-11-09T10:00'),
    })
    expect(doses[0]).toBe(istanbul('2026-11-10T10:00'))
  })

  test('drifts through the clock when the hours do not divide 24', () => {
    const doses = nextIntervalDoses({
      anchor: istanbul('2026-11-03T22:00'),
      hours: 7,
      now: istanbul('2026-11-04T06:00'),
    })
    expect(doses).toEqual([
      istanbul('2026-11-04T12:00'),
      istanbul('2026-11-04T19:00'),
      istanbul('2026-11-05T02:00'),
    ])
  })
})

test('paused interval previews expect no doses', () => {
  expect(
    nextIntervalDoses({
      anchor: istanbul('2026-11-03T08:00'),
      hours: 12,
      now: istanbul('2026-11-03T14:00'),
      pausedAt: istanbul('2026-11-03T14:00'),
    }),
  ).toEqual([])
})

describe('intervalOvernightNote', () => {
  test('counts overnight doses beyond the short preview instead of claiming only one', () => {
    expect(intervalOvernightNote(istanbul('2026-11-09T10:00'), 4, null)).toBe(
      'Includes doses overnight, from 22:00.',
    )
  })
})

test.each([
  ['2026-11-09T16:00', 8, null, 'Includes a dose overnight, at 00:00.'],
  ['2026-11-09T09:00', 24, null, undefined],
  ['2026-11-09T07:00', 12, null, undefined],
  ['2026-11-09T10:00', 4, '2026-11-09', 'Includes a dose overnight, at 22:00.'],
  ['2026-11-09T16:00', 8, '2026-11-09', undefined],
  ['2026-11-09T06:59', 24, null, 'Includes a dose overnight, at 06:59.'],
])(
  'overnight note respects cardinality, boundaries and Last day: %s / %s / %s',
  (first, hours, lastDay, expected) => {
    expect(intervalOvernightNote(istanbul(first), hours, lastDay)).toBe(expected)
  },
)
