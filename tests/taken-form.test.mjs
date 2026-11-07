import assert from 'node:assert/strict'
import { test } from 'vitest'
import { parseTakenDose } from '../src/features/schedules/contract.ts'
import { takenFormDefaults, takenFormSchema } from '../src/features/schedules/taken-form-schema.ts'

// Istanbul is UTC+3: 14:00 local is 11:00Z.
const now = '2035-06-15T14:00'
const scheduled = '2035-06-15T08:00'
const options = { unit: 'tablet', now, scheduled }

const errorsOf = (values, opts = options) => {
  const result = takenFormSchema(opts).safeParse(values)
  return result.success
    ? {}
    : Object.fromEntries(result.error.issues.map((issue) => [issue.path.join('.'), issue.message]))
}
const values = (overrides) => ({ when: 'now', date: '', time: '', quantity: '1', ...overrides })

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
  const other = (date, time) => values({ when: 'other', date, time })
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
