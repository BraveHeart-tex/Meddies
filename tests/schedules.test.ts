import type {
  DailyScheduleInput,
  DailySchedule,
  DoseRecord,
  SkippedDoseRecord,
  ScheduleCommand,
  SendSchedule,
  DoseOccurrence,
} from '../src/features/schedules/contract'
import assert from 'node:assert/strict'
import { test } from 'vitest'
import { createScheduleOperations } from '../src/features/schedules/operations'

// Legacy snapshots below intentionally omit weekdays to exercise the default.
// Each send mock answers only the command exercised by its test.
const input: DailyScheduleInput = {
  id: 'c8850347-dda8-4ecb-9d4a-c1821dbe182d',
  medicineId: '6e0b55ee-2e10-4e00-80f2-a736c2f50f95',
  startDate: '2026-11-04',
  times: [{ time: '09:00', quantity: 0.5 }],
}
test('daily setup requires authentication and rejects malformed times, dates and quantities', async () => {
  const operations = createScheduleOperations({
    requireUser: async () => ({ id: 'google:alice' }),
    send: async () => assert.fail('invalid schedule must not be persisted'),
    now: () => new Date('2026-11-03T12:00:00Z'),
  })
  for (const patch of [
    { times: [] },
    { times: [{ time: '24:00', quantity: 1 }] },
    { times: [{ time: '09:00', quantity: 0 }] },
    { times: [{ time: '09:00', quantity: 0.25 }] },
    {
      times: [
        { time: '09:00', quantity: 1 },
        { time: '09:00', quantity: 2 },
      ],
    },
    { startDate: '2026-02-30' },
    { medicineId: 'invalid' },
    { weekdays: [] },
    { weekdays: [1, 1] },
    { weekdays: [7] },
    { endDate: '2026-11-03' },
  ])
    await assert.rejects(() => operations.save({ ...input, ...patch }), /validation/)
  const anonymous = createScheduleOperations({
    requireUser: async () => {
      throw new Error('unauthorized')
    },
    send: async () => assert.fail('unauthorized'),
  })
  await assert.rejects(() => anonymous.save(input), /unauthorized/)
})

test('selected weekdays find the next dose across the week and retain the inclusive end day', async () => {
  const schedule: Omit<DailySchedule, 'weekdays'> & { weekdays?: number[] } = {
    ...input,
    startDate: '2026-11-08',
    weekdays: [1],
    endDate: '2026-11-09',
    times: [{ time: '09:00', quantity: 1 }],
    confirmedAt: '2026-11-07T21:00:00.000Z',
  }
  const operations = createScheduleOperations({
    requireUser: async () => ({ id: 'google:alice' }),
    send: (async () => ({ schedules: [schedule], records: [] })) as SendSchedule,
    now: () => new Date('2026-11-08T12:00:00.000Z'),
  })
  const today = (await operations.snapshot()).today
  assert.deepEqual(today.doses, [])
  assert.equal(today.next!.dueAt, '2026-11-09T06:00:00.000Z')
  assert.equal(today.next!.id, `${schedule.id}:2026-11-09T06:00:00.000Z`)
  const later = createScheduleOperations({
    requireUser: async () => ({ id: 'google:alice' }),
    send: (async () => ({ schedules: [schedule], records: [] })) as SendSchedule,
    now: () => new Date('2026-11-10T12:00:00.000Z'),
  })
  assert.equal((await later.history('2026-11-09'))[0].dueAt, '2026-11-09T06:00:00.000Z')
  assert.deepEqual(await later.history('2026-11-10'), [])

  const noEnd = { ...schedule, endDate: null }
  const afterMonday = createScheduleOperations({
    requireUser: async () => ({ id: 'google:alice' }),
    send: (async () => ({ schedules: [noEnd], records: [] })) as SendSchedule,
    // Past Monday's Up next window (#275), so the next Scheduled dose leads.
    now: () => new Date('2026-11-09T07:30:00.000Z'),
  })
  const nextWeek = (await afterMonday.snapshot()).today.next
  assert.equal(nextWeek!.dueAt, '2026-11-16T06:00:00.000Z')
  assert.equal(nextWeek!.id, `${schedule.id}:2026-11-16T06:00:00.000Z`)
})

test('history reads an earlier Istanbul day with elapsed explicit and unlogged outcomes only', async () => {
  const now = new Date('2026-11-05T07:00:00.000Z')
  const schedule: Omit<DailySchedule, 'weekdays'> & { weekdays?: number[] } = {
    ...input,
    startDate: '2026-11-04',
    times: [
      { time: '00:00', quantity: 1 },
      { time: '08:00', quantity: 1 },
      { time: '09:00', quantity: 2 },
      { time: '10:00', quantity: 0.5 },
    ],
    confirmedAt: '2026-11-03T21:00:00.000Z',
  }
  const taken: DoseRecord = {
    outcome: 'Taken',
    scheduleId: schedule.id,
    dueAt: '2026-11-04T05:00:00.000Z',
    takenAt: '2026-11-04T06:15:00.000Z',
    quantity: 1.5,
  }
  const skipped: SkippedDoseRecord = {
    outcome: 'Skipped',
    scheduleId: schedule.id,
    dueAt: '2026-11-04T06:00:00.000Z',
    recordedAt: '2026-11-04T06:30:00.000Z',
  }
  let command: ScheduleCommand | undefined
  const operations = createScheduleOperations({
    requireUser: async () => ({ id: 'google:alice' }),
    send: (async (value: ScheduleCommand) => {
      command = value
      return { schedules: [schedule], records: [taken, skipped] }
    }) as SendSchedule,
    now: () => now,
  })
  const day = await operations.history('2026-11-04')
  assert.deepEqual(command, {
    operation: 'listOutcomes',
    ownerId: 'google:alice',
    date: '2026-11-04',
  })
  assert.deepEqual(
    day.map(({ dueAt, status }) => ({ dueAt, status })),
    [
      { dueAt: taken.dueAt, status: 'Taken' },
      { dueAt: skipped.dueAt, status: 'Skipped' },
      { dueAt: '2026-11-04T07:00:00.000Z', status: 'Not logged' },
    ],
  )
  assert.equal(
    (day[0] as Extract<DoseOccurrence, { status: 'Taken' }>).record.takenAt,
    taken.takenAt,
  )
  assert.equal((day[0] as Extract<DoseOccurrence, { status: 'Taken' }>).record.quantity, 1.5)
  await assert.rejects(() => operations.history('2026-11-06'), /validation/)
  await assert.rejects(() => operations.history('2026-02-30'), /validation/)
})

test('history for today includes only occurrences due at or before captured now', async () => {
  const now = new Date('2026-11-05T07:00:00.000Z')
  const schedule: Omit<DailySchedule, 'weekdays'> & { weekdays?: number[] } = {
    ...input,
    startDate: '2026-11-05',
    times: [
      { time: '09:59', quantity: 1 },
      { time: '10:00', quantity: 1 },
      { time: '10:01', quantity: 1 },
    ],
    confirmedAt: '2026-11-04T20:00:00.000Z',
  }
  const operations = createScheduleOperations({
    requireUser: async () => ({ id: 'google:alice' }),
    send: (async () => ({ schedules: [schedule], records: [] })) as SendSchedule,
    now: () => now,
  })
  assert.deepEqual(
    (await operations.history('2026-11-05')).map((dose) => dose.dueAt),
    ['2026-11-05T06:59:00.000Z', '2026-11-05T07:00:00.000Z'],
  )
})

test('Today keeps stable Istanbul doses across reload, date rollover and device timezone changes', async () => {
  let now = new Date('2026-11-03T20:59:59Z')
  const schedule: Omit<DailySchedule, 'weekdays'> & { weekdays?: number[] } = {
    ...input,
    startDate: '2026-11-03',
    times: [
      { time: '00:00', quantity: 0.5 },
      { time: '23:40', quantity: 1 },
    ],
    confirmedAt: '2026-11-03T20:30:00.000Z',
  }
  const operations = createScheduleOperations({
    requireUser: async () => ({ id: 'google:alice' }),
    send: (async () => ({ schedules: [schedule], records: [] })) as SendSchedule,
    now: () => now,
  })
  const today = (await operations.snapshot()).today
  assert.equal(today.date, '2026-11-03')
  assert.deepEqual(
    today.doses.map(({ dueAt, quantity, status }) => ({ dueAt, quantity, status })),
    [{ dueAt: '2026-11-03T20:40:00.000Z', quantity: 1, status: 'Not logged' }],
  )
  // The Not logged 23:40 dose is inside the Up next window (#275).
  assert.equal(today.next!.dueAt, '2026-11-03T20:40:00.000Z')
  const previousTz = process.env.TZ
  try {
    process.env.TZ = 'America/Los_Angeles'
    assert.deepEqual((await operations.snapshot()).today, today)
  } finally {
    if (previousTz === undefined) delete process.env.TZ
    else process.env.TZ = previousTz
  }
  now = new Date('2026-11-03T21:00:00Z')
  const midnight = (await operations.snapshot()).today
  assert.equal(midnight.date, '2026-11-04')
  // Yesterday's unresolved 23:40 stays in To log (#275); the new day's 00:00 leads Up next.
  assert.equal(midnight.doses[0].dueAt, '2026-11-03T20:40:00.000Z')
  assert.equal(midnight.doses[1].dueAt, '2026-11-03T21:00:00.000Z')
  assert.equal(midnight.doses[1].status, 'Due now')
  assert.equal(midnight.next!.id, midnight.doses[1].id)
})

test('initial confirmation excludes earlier and exactly equal times; future start dates have no Today backlog', async () => {
  let now = new Date('2026-11-03T06:00:00Z')
  let schedule: Omit<DailySchedule, 'weekdays'> = {
    ...input,
    startDate: '2026-11-03',
    times: [
      { time: '08:00', quantity: 1 },
      { time: '09:00', quantity: 1 },
      { time: '10:00', quantity: 0.5 },
    ],
    confirmedAt: '2026-11-03T06:00:00.000Z',
  }
  const operations = createScheduleOperations({
    requireUser: async () => ({ id: 'google:alice' }),
    send: (async () => ({ schedules: [schedule], records: [] })) as SendSchedule,
    now: () => now,
  })
  assert.deepEqual(
    (await operations.snapshot()).today.doses.map((dose) => dose.dueAt),
    ['2026-11-03T07:00:00.000Z'],
  )
  now = new Date('2026-11-03T20:59:59Z')
  schedule = { ...schedule, startDate: '2026-12-31' }
  const result = (await operations.snapshot()).today
  assert.deepEqual(result.doses, [])
  assert.equal(result.next!.dueAt, '2026-12-31T05:00:00.000Z')
  now = new Date('2026-12-31T21:00:00Z')
  assert.equal((await operations.snapshot()).today.date, '2027-01-01')
  assert.equal((await operations.snapshot()).today.next!.dueAt, '2027-01-01T05:00:00.000Z')
})

test('Today projects both persisted outcomes, leaves elapsed doses Not logged and advances next', async () => {
  const now = new Date('2026-11-05T07:00:00.000Z')
  const schedule: Omit<DailySchedule, 'weekdays'> & { weekdays?: number[] } = {
    ...input,
    startDate: '2026-11-05',
    times: [
      { time: '08:00', quantity: 1 },
      { time: '09:00', quantity: 1 },
      { time: '09:30', quantity: 0.5 },
    ],
    confirmedAt: '2026-11-04T20:00:00.000Z',
  }
  const skipped: SkippedDoseRecord = {
    outcome: 'Skipped',
    scheduleId: schedule.id,
    dueAt: '2026-11-05T06:00:00.000Z',
    recordedAt: '2026-11-05T06:30:00.000Z',
  }
  const taken: DoseRecord = {
    outcome: 'Taken',
    scheduleId: schedule.id,
    dueAt: '2026-11-05T06:30:00.000Z',
    takenAt: '2026-11-05T06:20:00.000Z',
    quantity: 0.5,
  }
  let command: ScheduleCommand | undefined
  const operations = createScheduleOperations({
    requireUser: async () => ({ id: 'google:alice' }),
    send: (async (value: ScheduleCommand) => {
      command = value
      return { schedules: [schedule], records: [skipped, taken] }
    }) as SendSchedule,
    now: () => now,
  })
  const today = (await operations.snapshot()).today
  assert.equal(command!.operation, 'listOutcomes')
  assert.deepEqual(
    today.doses.map((dose) => dose.status),
    ['Not logged', 'Skipped', 'Taken'],
  )
  assert.equal(today.next!.dueAt, '2026-11-06T05:00:00.000Z')
})

test('recordSkipped authenticates and validates before dispatch, deriving owner from session', async () => {
  const sent: ScheduleCommand[] = []
  const operations = createScheduleOperations({
    requireUser: async () => ({ id: 'google:alice' }),
    send: (async (command: Extract<ScheduleCommand, { operation: 'recordSkipped' }>) => {
      sent.push(command)
      return {
        records: [
          { ...command.record, outcome: 'Skipped', recordedAt: '2026-11-05T06:30:00.000Z' },
        ],
      }
    }) as SendSchedule,
  })
  const input = {
    outcome: 'Skipped',
    scheduleId: 'c8850347-dda8-4ecb-9d4a-c1821dbe182d',
    dueAt: '2026-11-05T06:00:00.000Z',
    ownerId: 'google:attacker',
  }
  assert.equal((await operations.recordSkipped(input)).outcome, 'Skipped')
  assert.equal(sent[0].ownerId, 'google:alice')
  await assert.rejects(
    () => operations.recordSkipped({ ...input, dueAt: 'not-an-instant' }),
    /validation/,
  )
  assert.equal(sent.length, 1)
  const anonymous = createScheduleOperations({
    requireUser: async () => {
      throw new Error('unauthorized')
    },
    send: async () => assert.fail('anonymous skip must not dispatch'),
  })
  await assert.rejects(() => anonymous.recordSkipped(input), /unauthorized/)
})

test('correctOutcome dispatches a stable action id with the expected prior revision', async () => {
  const actionId = '83c390c1-bab7-48b7-84c5-08d3e99b414d'
  let command: ScheduleCommand | undefined
  const operations = createScheduleOperations({
    requireUser: async () => ({ id: 'google:alice' }),
    send: (async (value: ScheduleCommand) => {
      command = value
      return {
        records: [
          {
            outcome: 'Skipped',
            scheduleId: input.id,
            dueAt: '2026-11-05T06:00:00.000Z',
            recordedAt: '2026-11-05T06:30:00.000Z',
            revision: 1,
            actionId,
          },
        ],
      }
    }) as SendSchedule,
  })
  const saved = await operations.correctOutcome({
    actionId,
    scheduleId: input.id,
    dueAt: '2026-11-05T06:00:00.000Z',
    expectedRevision: 0,
    expectedOutcome: 'Taken',
    outcome: 'Skipped',
  })
  assert.equal(command!.operation, 'correctOutcome')
  assert.equal(command!.ownerId, 'google:alice')
  assert.equal(saved.revision, 1)
})
