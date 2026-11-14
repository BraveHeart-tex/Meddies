import type { TakenFormOptions, TakenFormValues } from '../src/features/schedules/taken-form-schema'
import assert from 'node:assert/strict'
import { test } from 'vitest'
import { parseTakenDose } from '../src/features/schedules/contract'
import { takenFormDefaults, takenFormSchema } from '../src/features/schedules/taken-form-schema'

// Istanbul is UTC+3: 14:00 local is 11:00Z.
const now = '2035-06-15T14:00'
const scheduled = '2035-06-15T08:00'
const options: TakenFormOptions = { unit: 'tablet', now, scheduled }

const errorsOf = (values: unknown, opts = options) => {
  const result = takenFormSchema(opts).safeParse(values)
  return result.success
    ? {}
    : Object.fromEntries(result.error.issues.map((issue) => [issue.path.join('.'), issue.message]))
}
const values = (overrides?: Partial<TakenFormValues>): TakenFormValues => ({
  when: 'now',
  date: '',
  time: '',
  quantity: '1',
  ...overrides,
})

test('Now saves the minute shown as an Istanbul instant', () => {
  assert.deepEqual(takenFormSchema(options).parse(values()), {
    takenAt: '2035-06-15T11:00:00.000Z',
    quantity: 1,
  })
})

test('a correction keeps its exact instant while the shown minute is unchanged', () => {
  const original = { local: '2035-06-15T09:00', instant: '2035-06-15T06:00:42.123Z' }
  const schema = takenFormSchema({ ...options, original })
  const edit = values({ when: 'other', date: '2035-06-15', time: '09:00', quantity: '1½' })
  assert.deepEqual(schema.parse(edit), { takenAt: original.instant, quantity: 1.5 })
  assert.equal(schema.parse({ ...edit, time: '09:01' }).takenAt, '2035-06-15T06:01:00.000Z')
})

test('At scheduled saves the scheduled minute, only once it has passed', () => {
  assert.equal(
    takenFormSchema(options).parse(values({ when: 'scheduled' })).takenAt,
    '2035-06-15T05:00:00.000Z',
  )
  assert.deepEqual(
    errorsOf(values({ when: 'scheduled' }), { ...options, scheduled: '2035-06-15T20:00' }),
    {
      when: 'Choose a time that has passed.',
    },
  )
})

test('Other takes a passed time today or yesterday', () => {
  const other = (date: string, time: string) => values({ when: 'other', date, time })
  assert.equal(
    takenFormSchema(options).parse(other('2035-06-14', '23:30')).takenAt,
    '2035-06-14T20:30:00.000Z',
  )
  assert.deepEqual(errorsOf(other('2035-06-15', '14:01')), {
    time: 'Choose a time that has passed.',
  })
  assert.deepEqual(errorsOf(other('2035-06-15', '14:00')), {})
  assert.deepEqual(errorsOf(other('2035-06-15', '08:')), { time: 'Choose a time.' })
  assert.deepEqual(errorsOf(other('2035-06-13', '08:00')), { date: 'Choose today or yesterday.' })
  assert.deepEqual(errorsOf(other('', '')), { date: 'Choose today or yesterday.' })
})

test('a scheduled dose takes dates in its Taken time window, the same rule as the Worker', () => {
  // From History on Jun 15: the Jun 10 08:00 dose (05:00Z) accepts Jun 9, 10 and 11 only.
  const history: TakenFormOptions = {
    ...options,
    scheduled: '2035-06-10T08:00',
    dueAt: '2035-06-10T05:00:00.000Z',
  }
  const other = (date: string, time: string) => values({ when: 'other', date, time })
  for (const date of ['2035-06-09', '2035-06-10', '2035-06-11'])
    assert.deepEqual(errorsOf(other(date, '08:30'), history), {}, date)
  // Outside the window, including today, and Now on a later day.
  for (const date of ['2035-06-08', '2035-06-12', '2035-06-15'])
    assert.deepEqual(errorsOf(other(date, '08:30'), history), {
      date: 'Choose a date within a day of the dose.',
    })
  assert.deepEqual(errorsOf(values(), history), {
    when: 'Choose a time within a day of the dose.',
  })
  // Today's dose: the day after is still not in the past.
  const todayDose = { ...options, dueAt: '2035-06-15T05:00:00.000Z' }
  assert.deepEqual(errorsOf(other('2035-06-14', '08:00'), todayDose), {})
  assert.deepEqual(errorsOf(other('2035-06-16', '08:00'), todayDose), {
    time: 'Choose a time that has passed.',
  })
})

test('Earlier saved time: a correction keeps an out-of-window minute but cannot move to another', () => {
  const original = { local: '2035-06-15T10:00', instant: '2035-06-15T07:00:00.000Z' }
  const history: TakenFormOptions = {
    ...options,
    scheduled: '2035-06-10T08:00',
    dueAt: '2035-06-10T05:00:00.000Z',
    original,
  }
  const kept = values({ when: 'other', date: '2035-06-15', time: '10:00', quantity: '2' })
  assert.deepEqual(takenFormSchema(history).parse(kept), { takenAt: original.instant, quantity: 2 })
  assert.deepEqual(errorsOf({ ...kept, time: '11:00' }, history), {
    date: 'Choose a date within a day of the dose.',
  })
})

test('quantities follow the unit and blank never becomes zero', () => {
  assert.deepEqual(errorsOf(values({ quantity: '' })), { quantity: 'Enter a quantity.' })
  assert.deepEqual(errorsOf(values({ quantity: '1.25' })), {
    quantity: 'Use whole or half tablets.',
  })
  assert.deepEqual(errorsOf(values({ quantity: '1.5' }), { ...options, unit: 'capsule' }), {
    quantity: 'Use whole capsules.',
  })
  assert.equal(takenFormSchema(options).parse(values({ quantity: '½' })).quantity, 0.5)
})

test('output passes the server Taken parser', () => {
  const key = {
    scheduleId: '6e0b55ee-2e10-4e00-80f2-a736c2f50f95',
    dueAt: '2035-06-15T05:00:00.000Z',
  }
  const details = takenFormSchema(options).parse(
    values({ when: 'other', date: '2035-06-14', time: '22:00', quantity: '2' }),
  )
  assert.deepEqual(parseTakenDose({ ...key, ...details }), { ...key, ...details })
})

test('defaults: Now for a first recording, the recorded minute for an edit', () => {
  assert.deepEqual(takenFormDefaults(1), { when: 'now', date: '', time: '', quantity: '1' })
  assert.deepEqual(takenFormDefaults(0.5, { local: '2035-06-14T23:10' }), {
    when: 'other',
    date: '2035-06-14',
    time: '23:10',
    quantity: '½',
  })
})

test('inline quantities share the Taken contract safe half-unit boundary', () => {
  for (const [text, valid] of [
    ['4503599627370495', true],
    ['4503599627370495.5', true],
    ['4503599627370496', false],
    ['9007199254740991', false],
  ] as const) {
    assert.equal(
      takenFormSchema(options).safeParse(values({ quantity: text })).success,
      valid,
      text,
    )
    const parse = () =>
      parseTakenDose({
        scheduleId: '6e0b55ee-2e10-4e00-80f2-a736c2f50f95',
        dueAt: '2035-06-15T05:00:00.000Z',
        takenAt: '2035-06-15T11:00:00.000Z',
        quantity: Number(text),
      })
    if (valid) assert.doesNotThrow(parse)
    else assert.throws(parse)
  }
})
