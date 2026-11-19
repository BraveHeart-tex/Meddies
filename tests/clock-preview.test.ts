import { describe, expect, test } from 'vitest'
import { nextClockDose, nextClockDoses } from '../src/features/schedules/clock-preview'

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

test('paused clock previews expect no doses', () => {
  expect(
    nextClockDoses({
      weekdays: EVERY_DAY,
      times: ['08:00', '20:00'],
      now: istanbul('2026-11-03T14:00'),
      pausedAt: istanbul('2026-11-03T14:00'),
    }),
  ).toEqual([])
})

describe('nextClockDose', () => {
  // Every day at 08:00 (5 ml) and 20:00 (2.5 ml) since Mon 2 Nov.
  const schedule = {
    weekdays: EVERY_DAY,
    times: [
      { time: '08:00', quantity: 5 },
      { time: '20:00', quantity: 2.5 },
    ],
    startDate: '2026-11-02',
    endDate: null,
    stoppedAt: null,
    pausedAt: null,
  }

  test('at 10:00 the next dose is 20:00 with its own quantity', () => {
    expect(nextClockDose(schedule, istanbul('2026-11-09T10:00'))).toEqual({
      instant: istanbul('2026-11-09T20:00'),
      time: '20:00',
      quantity: 2.5,
    })
  })

  test('a dose due exactly now is not next', () => {
    expect(nextClockDose(schedule, istanbul('2026-11-09T20:00'))).toMatchObject({
      instant: istanbul('2026-11-10T08:00'),
      quantity: 5,
    })
  })

  test('rolls over to the next permitted weekday', () => {
    // Monday 9 November after the last time, on a Monday and Thursday schedule.
    expect(
      nextClockDose({ ...schedule, weekdays: [1, 4] }, istanbul('2026-11-09T21:00')),
    ).toMatchObject({ instant: istanbul('2026-11-12T08:00'), time: '08:00' })
  })

  test('no dose remains after the last one on the Last day', () => {
    expect(
      nextClockDose({ ...schedule, endDate: '2026-11-09' }, istanbul('2026-11-09T21:00')),
    ).toBeNull()
    // The Last day falls on a day the schedule does not run.
    expect(
      nextClockDose(
        { ...schedule, weekdays: [1, 4], endDate: '2026-11-11' },
        istanbul('2026-11-09T21:00'),
      ),
    ).toBeNull()
  })

  test('none before the start day, then the first dose on it', () => {
    const future = { ...schedule, startDate: '2026-11-10' }
    expect(nextClockDose(future, istanbul('2026-11-09T23:59'))).toBeNull()
    expect(nextClockDose(future, istanbul('2026-11-10T00:00'))).toMatchObject({
      instant: istanbul('2026-11-10T08:00'),
    })
  })

  test('none while paused or once Ended', () => {
    const now = istanbul('2026-11-09T10:00')
    expect(nextClockDose({ ...schedule, pausedAt: istanbul('2026-11-07T09:00') }, now)).toBeNull()
    expect(nextClockDose({ ...schedule, stoppedAt: istanbul('2026-11-09T09:00') }, now)).toBeNull()
    expect(nextClockDose({ ...schedule, endDate: '2026-11-08' }, now)).toBeNull()
  })
})
