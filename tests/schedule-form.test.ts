import type {
  ScheduleFormOptions,
  ScheduleFormValues,
} from '../src/features/schedules/schedule-form-schema'
import assert from 'node:assert/strict'
import { test } from 'vitest'
import { parseSchedule } from '../src/features/schedules/contract'
import {
  scheduleFormDefaults,
  scheduleFormSchema,
} from '../src/features/schedules/schedule-form-schema'

const today = '2035-06-15'
const id = '6e0b55ee-2e10-4e00-80f2-a736c2f50f95'
const medicineId = '0b7c6a52-8b1e-4d9e-9e0f-2f51a0c3d111'

const errorsOf = (values: unknown, options: ScheduleFormOptions = { unit: 'tablet', today }) => {
  const result = scheduleFormSchema(options).safeParse(values)
  return result.success
    ? {}
    : Object.fromEntries(result.error.issues.map((issue) => [issue.path.join('.'), issue.message]))
}
const row = (time: string, quantity = '1') => ({ time, quantity })
const values = (overrides: Partial<ScheduleFormValues>): ScheduleFormValues => ({
  startDate: today,
  weekdays: [0, 1, 2, 3, 4, 5, 6],
  times: [row('08:00')],
  ...overrides,
})

test('defaults: every day from today, one empty time taking one of the unit', () => {
  assert.deepEqual(scheduleFormDefaults('capsule', today), {
    startDate: today,
    weekdays: [0, 1, 2, 3, 4, 5, 6],
    times: [{ time: '', quantity: '1' }],
  })
  assert.deepEqual(errorsOf(scheduleFormDefaults('tablet', today)), {
    'times.0.time': 'Choose a time.',
  })
})

test('valid values convert quantities to numbers and sort weekdays', () => {
  assert.deepEqual(
    scheduleFormSchema({ unit: 'tablet', today }).parse(
      values({ weekdays: [5, 1, 3], times: [row('20:00', '1½'), row('08:00', '0.5')] }),
    ),
    {
      startDate: today,
      weekdays: [1, 3, 5],
      times: [
        { time: '20:00', quantity: 1.5 },
        { time: '08:00', quantity: 0.5 },
      ],
    },
  )
})

test('no days, half-chosen times and repeated times are reported on their own rows', () => {
  assert.deepEqual(
    errorsOf(values({ weekdays: [], times: [row('08:00'), row('08:'), row('08:00')] })),
    {
      weekdays: 'Choose at least one day.',
      'times.1.time': 'Choose a time.',
      'times.2.time': '08:00 is already in this schedule.',
    },
  )
})

test('quantities: blank is not zero, tablets in halves, capsules whole', () => {
  assert.deepEqual(
    errorsOf(
      values({
        times: [row('01:00', ''), row('02:00', '0'), row('03:00', '0.25'), row('04:00', 'x')],
      }),
    ),
    {
      'times.0.quantity': 'Enter a quantity.',
      'times.1.quantity': 'Use ½ tablet or more.',
      'times.2.quantity': 'Use whole or half tablets.',
      'times.3.quantity': 'Use ½ tablet or more.',
    },
  )
  assert.deepEqual(
    errorsOf(values({ times: [row('01:00', '1.5'), row('02:00', '0'), row('03:00', '2')] }), {
      unit: 'capsule',
      today,
    }),
    {
      'times.0.quantity': 'Use whole capsules.',
      'times.1.quantity': 'Use 1 capsule or more.',
    },
  )
})

test('start date: today or later, except the date of a save being retried', () => {
  const yesterday = '2035-06-14'
  assert.deepEqual(errorsOf(values({ startDate: yesterday })), {
    startDate: 'Choose today or a later date.',
  })
  assert.deepEqual(errorsOf(values({ startDate: '' })), { startDate: 'Choose a date.' })
  assert.deepEqual(
    errorsOf(values({ startDate: yesterday }), {
      unit: 'tablet',
      today,
      retryStartDate: yesterday,
    }),
    {},
  )
})

test('one to 24 times', () => {
  const times = Array.from({ length: 25 }, (_, hour) =>
    row(`${String(hour % 24).padStart(2, '0')}:${hour === 24 ? '30' : '00'}`),
  )
  assert.deepEqual(errorsOf(values({ times })), { times: 'Use 24 times or fewer.' })
  assert.deepEqual(errorsOf(values({ times: [] })), { times: 'Add a time.' })
})

test('client-valid values are accepted by the server parser, and rejected ones are not', () => {
  const cases: { unit: ScheduleFormOptions['unit']; values: ScheduleFormValues }[] = [
    { unit: 'tablet', values: values({ times: [row('08:00', '½'), row('21:30', '2')] }) },
    { unit: 'capsule', values: values({ weekdays: [0], times: [row('23:59', '3')] }) },
    { unit: 'tablet', values: values({ times: [row('08:00'), row('08:00')] }) },
    { unit: 'tablet', values: values({ times: [row('08:00', '0.25')] }) },
    { unit: 'tablet', values: values({ weekdays: [] }) },
  ]
  for (const { unit, values: input } of cases) {
    const client = scheduleFormSchema({ unit, today }).safeParse(input)
    let server = true
    try {
      parseSchedule({
        id,
        medicineId,
        ...input,
        times: input.times.map((slot) => ({
          time: slot.time,
          quantity: Number(slot.quantity.replace('½', '.5')),
        })),
      })
    } catch {
      server = false
    }
    assert.equal(client.success, server, JSON.stringify(input))
    if (client.success)
      assert.deepEqual(
        parseSchedule({ id, medicineId, ...client.data }).times,
        [...client.data.times].sort((a, b) => a.time.localeCompare(b.time)),
      )
  }
})
