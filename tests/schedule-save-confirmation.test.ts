import { expect, test } from 'vitest'
import { matchScheduleConfirmation } from '../src/features/schedules/schedule-save-confirmation'

const setup = {
  id: '00000000-0000-4000-8000-0000000000a1',
  medicineId: '00000000-0000-4000-8000-000000000001',
  startDate: '2035-06-15',
  weekdays: [0, 1, 2, 3, 4, 5, 6],
  times: [{ time: '08:00', quantity: 1 }],
  endDate: null,
  intervalHours: null,
}
const confirmedAt = '2035-06-15T06:00:00.000Z'
const savedSetup = { ...setup, confirmedAt }
const envelope = (record: unknown) => ({ schedules: [record] })

test('Schedule setup returns the matching Schedule with its confirmation time', () => {
  expect(matchScheduleConfirmation(envelope(savedSetup), setup, false)).toEqual(savedSetup)
})

const malformedConfirmations = [
  ['empty envelope', { schedules: [] }],
  ['absent envelope', {}],
  ['malformed record', envelope({})],
] satisfies [string, unknown][]

test.each<[string, unknown]>([
  ...malformedConfirmations,
  ['missing confirmation time', envelope(setup)],
  ['invalid confirmation time', envelope({ ...savedSetup, confirmedAt: 'bad' })],
])('Schedule setup rejects %s', (_name, response) => {
  expect(() => matchScheduleConfirmation(response, setup, false)).toThrow()
})

test.each<[string, Record<string, unknown>, Record<string, unknown>?]>([
  ['ID', { id: '00000000-0000-4000-8000-0000000000b1' }],
  ['Medicine', { medicineId: '00000000-0000-4000-8000-000000000002' }],
  ['start date', { startDate: '2035-06-16' }],
  ['weekdays', { weekdays: [1] }],
  ['time', { times: [{ time: '09:00', quantity: 1 }] }],
  ['quantity', { times: [{ time: '08:00', quantity: 2 }] }],
  ['Last day', { endDate: '2035-06-20' }],
  ['Interval length', { intervalHours: 8 }, { intervalHours: 6 }],
])('Schedule setup rejects a different %s', (_name, patch, attempted = {}) => {
  expect(() =>
    matchScheduleConfirmation(
      envelope({ ...savedSetup, ...patch }),
      { ...setup, ...attempted },
      false,
    ),
  ).toThrow('Schedule confirmation does not match attempt')
})

const change = {
  id: '00000000-0000-4000-8000-0000000000b1',
  basedOnId: setup.id,
  times: setup.times,
  weekdays: setup.weekdays,
  endDate: null,
  intervalHours: null,
}
const savedChange = { ...savedSetup, id: change.id, startDate: '2035-06-16' }
const anchoredChange = { ...change, anchorDate: '2035-06-18', intervalHours: 6 }
const savedAnchoredChange = { ...savedChange, startDate: '2035-06-18', intervalHours: 6 }

test.each<[string, unknown]>([
  ...malformedConfirmations,
  ['missing confirmation time', envelope({ ...savedChange, confirmedAt: undefined })],
  ['invalid confirmation time', envelope({ ...savedChange, confirmedAt: 'bad' })],
])('Schedule change rejects %s', (_name, response) => {
  expect(() => matchScheduleConfirmation(response, change, true)).toThrow()
})

test.each<[string, Record<string, unknown>, Record<string, unknown>?, Record<string, unknown>?]>([
  ['ID', { id: setup.id }],
  ['weekdays', { weekdays: [1] }],
  ['time', { times: [{ time: '09:00', quantity: 1 }] }],
  ['quantity', { times: [{ time: '08:00', quantity: 2 }] }],
  ['Interval length', { intervalHours: 8 }, anchoredChange, savedAnchoredChange],
  ['Last day', { endDate: '2035-06-20' }],
  ['supplied Anchor date', { startDate: '2035-06-19' }, anchoredChange, savedAnchoredChange],
])(
  'Schedule change rejects a different %s',
  (_name, patch, attempted = change, saved = savedChange) => {
    expect(() =>
      matchScheduleConfirmation(envelope({ ...saved, ...patch }), attempted, true),
    ).toThrow('Schedule confirmation does not match attempt')
  },
)

test.each([
  ['supplied Anchor date', anchoredChange, savedAnchoredChange],
  ['server-derived start date', change, savedChange],
])(
  'Schedule change returns the confirmed Schedule version with a %s',
  (_name, attempted, saved) => {
    expect(matchScheduleConfirmation(envelope(saved), attempted, true)).toEqual({
      ...saved,
      basedOnId: setup.id,
      replacedAt: null,
    })
  },
)
