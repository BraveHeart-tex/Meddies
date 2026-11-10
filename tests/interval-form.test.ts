import { describe, expect, test } from 'vitest'
import { parseSchedule } from '../src/features/schedules/contract'
import {
  intervalFormDefaults,
  intervalFormSchema,
} from '../src/features/schedules/interval-form-schema'
import { firstOvernightDose } from '../src/features/schedules/interval-preview'

const today = '2026-11-09'
const id = '6e0b55ee-2e10-4e00-80f2-a736c2f50f95'
const medicineId = '0b7c6a52-8b1e-4d9e-9e0f-2f51a0c3d111'
const valid = { hours: '8', date: today, time: '08:00', quantity: '1', lastDay: null }

const errorsOf = (
  values: Partial<typeof valid>,
  options: { unit?: 'tablet' | 'capsule'; retryStartDate?: string } = {},
) => {
  const result = intervalFormSchema({ unit: 'tablet', today, ...options }).safeParse({
    ...valid,
    ...values,
  })
  return result.success
    ? {}
    : Object.fromEntries(result.error.issues.map((issue) => [issue.path.join('.'), issue.message]))
}

describe('interval form defaults', () => {
  test('preselect today and one tablet or capsule, leaving hours and first time blank', () => {
    expect(intervalFormDefaults('capsule', today)).toEqual({
      hours: '',
      date: today,
      time: '',
      quantity: '1',
      lastDay: null,
    })
  })
})

describe('interval form validation', () => {
  test.each([
    ['', 'Choose how many hours.'],
    ['   ', 'Choose how many hours.'],
    ['1.5', 'Use whole hours, like 8.'],
    ['abc', 'Use whole hours, like 8.'],
    ['1e1', 'Use whole hours, like 8.'],
    ['0', 'Use 1 to 24 hours.'],
    ['-1', 'Use 1 to 24 hours.'],
    ['25', 'Use 1 to 24 hours.'],
    ['99999', 'Use 1 to 24 hours.'],
  ])('hours %j reads %j (764·C6, C10, C11)', (hours, message) => {
    expect(errorsOf({ hours })).toEqual({ hours: message })
  })

  test.each(['1', '24', ' 7 '])('hours %j is valid', (hours) => {
    expect(errorsOf({ hours })).toEqual({})
  })

  test('a first date is required and cannot be earlier than today (764·C12, C13)', () => {
    expect(errorsOf({ date: '' })).toEqual({ date: 'Choose a date.' })
    expect(errorsOf({ date: '2026-11-08' })).toEqual({ date: 'Choose today or a later date.' })
    expect(errorsOf({ date: '2026-11-10' })).toEqual({})
  })

  test('the start date of an unconfirmed save stays valid after midnight', () => {
    expect(errorsOf({ date: '2026-11-08' }, { retryStartDate: '2026-11-08' })).toEqual({})
  })

  test('a half-chosen first time is incomplete (764·C14)', () => {
    expect(errorsOf({ time: '' })).toEqual({ time: 'Choose a time.' })
    expect(errorsOf({ time: '08:' })).toEqual({ time: 'Choose a time.' })
  })

  test('quantity follows the medicine unit', () => {
    expect(errorsOf({ quantity: '' })).toEqual({ quantity: 'Enter a quantity.' })
    expect(errorsOf({ quantity: '0.5' })).toEqual({})
    expect(errorsOf({ quantity: '0.5' }, { unit: 'capsule' })).toEqual({
      quantity: 'Use whole capsules.',
    })
  })

  test('every problem reports at once (764·C6)', () => {
    expect(errorsOf({ hours: '', time: '' })).toEqual({
      hours: 'Choose how many hours.',
      time: 'Choose a time.',
    })
  })

  test('valid answers become a request the server parser accepts unchanged', () => {
    const output = intervalFormSchema({ unit: 'tablet', today }).parse({
      ...valid,
      hours: ' 7 ',
      quantity: '1½',
    })
    expect(output).toEqual({
      startDate: today,
      weekdays: [0, 1, 2, 3, 4, 5, 6],
      times: [{ time: '08:00', quantity: 1.5 }],
      intervalHours: 7,
      lastDay: null,
    })
    const { lastDay, ...request } = output
    expect(parseSchedule({ id, medicineId, ...request, endDate: lastDay })).toMatchObject(request)
  })
})

describe('firstOvernightDose', () => {
  const istanbul = (local: string) => new Date(`${local}:00+03:00`).toISOString()

  test('finds the first dose from 22:00 through 06:59 within a day of the first dose', () => {
    expect(firstOvernightDose(istanbul('2026-11-09T16:00'), 8)).toBe(istanbul('2026-11-10T00:00'))
    expect(firstOvernightDose(istanbul('2026-11-09T22:00'), 8)).toBe(istanbul('2026-11-09T22:00'))
    expect(firstOvernightDose(istanbul('2026-11-09T06:59'), 12)).toBe(istanbul('2026-11-09T06:59'))
  })

  test('sees a night dose beyond the three listed', () => {
    expect(firstOvernightDose(istanbul('2026-11-09T07:00'), 4)).toBe(istanbul('2026-11-09T23:00'))
  })

  test('is undefined when every dose within the day is daytime', () => {
    expect(firstOvernightDose(istanbul('2026-11-09T09:00'), 24)).toBeUndefined()
    expect(firstOvernightDose(istanbul('2026-11-09T07:00'), 12)).toBeUndefined()
  })
})
