import { describe, expect, test } from 'vitest'
import type { DailySchedule } from '../src/features/schedules/contract'
import {
  earliestLastDay,
  endedOn,
  lastDayProblem,
  untilLastDay,
} from '../src/features/schedules/last-day'

const today = '2026-11-09'

describe('the earliest Last day', () => {
  test('is today, or a later start date or Anchor date', () => {
    expect(earliestLastDay(today, '2026-11-02')).toBe(today)
    expect(earliestLastDay(today, '2026-11-11')).toBe('2026-11-11')
  })

  test('227·A3, A5 an earlier Last day names today, or the later earliest day', () => {
    expect(lastDayProblem(null, today, today)).toBeUndefined()
    expect(lastDayProblem(today, today, today)).toBeUndefined()
    expect(lastDayProblem('2026-11-08', today, today)).toBe('Choose today or a later date.')
    expect(lastDayProblem('2026-11-10', today, '2026-11-11')).toBe(
      'Choose Wed 11 Nov or a later date.',
    )
  })
})

test('227·A4 doses after the Last day are cut, in Istanbul time', () => {
  const doses = ['2026-11-10T20:00:00.000Z', '2026-11-10T21:00:00.000Z']
  // 23:00 on Tue 10 Nov still counts; 00:00 on Wed 11 Nov doesn't.
  expect(untilLastDay(doses, '2026-11-10')).toEqual(['2026-11-10T20:00:00.000Z'])
  expect(untilLastDay(doses, null)).toEqual(doses)
  expect(untilLastDay(null, '2026-11-10')).toBeNull()
})

describe('an Ended schedule', () => {
  const schedule = { endDate: null, stoppedAt: null } as Pick<
    DailySchedule,
    'endDate' | 'stoppedAt'
  >

  test('ends the day after its Last day', () => {
    expect(endedOn({ ...schedule, endDate: today }, today)).toBeNull()
    expect(endedOn({ ...schedule, endDate: '2026-11-03' }, today)).toBe('2026-11-03')
    expect(endedOn(schedule, today)).toBeNull()
  })

  test('a stopped schedule ends on its stop day, even that day', () => {
    // 01:00 on Mon 9 Nov in Istanbul is still Sun 8 Nov in UTC.
    expect(endedOn({ ...schedule, stoppedAt: '2026-11-08T22:00:00.000Z' }, today)).toBe(today)
  })
})
