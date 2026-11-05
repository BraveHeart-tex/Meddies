import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createScheduleOperations } from '../src/features/schedules/operations.ts'

const input = {
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

test('Today keeps stable Istanbul doses across reload, date rollover and device timezone changes', async () => {
  let now = new Date('2026-11-03T20:59:59Z')
  const schedule = {
    ...input,
    startDate: '2026-11-03',
    times: [
      { time: '00:00', quantity: 0.5 },
      { time: '23:59', quantity: 1 },
    ],
    confirmedAt: '2026-11-03T20:58:00.000Z',
  }
  const operations = createScheduleOperations({
    requireUser: async () => ({ id: 'google:alice' }),
    send: async () => ({ schedules: [schedule], records: [] }),
    now: () => now,
  })
  const today = (await operations.snapshot()).today
  assert.equal(today.date, '2026-11-03')
  assert.deepEqual(
    today.doses.map(({ dueAt, quantity, status }) => ({ dueAt, quantity, status })),
    [{ dueAt: '2026-11-03T20:59:00.000Z', quantity: 1, status: 'Not logged' }],
  )
  assert.equal(today.next.dueAt, '2026-11-03T21:00:00.000Z')
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
  assert.equal(midnight.doses[0].status, 'Due now')
  assert.equal(midnight.doses[0].id, today.next.id)
  assert.equal(midnight.next.id, today.next.id)
})

test('initial confirmation excludes earlier and exactly equal times; future start dates have no Today backlog', async () => {
  let now = new Date('2026-11-03T06:00:00Z')
  let schedule = {
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
    send: async () => ({ schedules: [schedule], records: [] }),
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
  assert.equal(result.next.dueAt, '2026-12-31T05:00:00.000Z')
  now = new Date('2026-12-31T21:00:00Z')
  assert.equal((await operations.snapshot()).today.date, '2027-01-01')
  assert.equal((await operations.snapshot()).today.next.dueAt, '2027-01-01T05:00:00.000Z')
})

test('Today projects both persisted outcomes, leaves elapsed doses Not logged and advances next', async () => {
  const now = new Date('2026-11-05T07:00:00.000Z')
  const schedule = {
    ...input,
    startDate: '2026-11-05',
    times: [
      { time: '08:00', quantity: 1 },
      { time: '09:00', quantity: 1 },
      { time: '09:30', quantity: 0.5 },
    ],
    confirmedAt: '2026-11-04T20:00:00.000Z',
  }
  const skipped = {
    outcome: 'Skipped',
    scheduleId: schedule.id,
    dueAt: '2026-11-05T06:00:00.000Z',
    recordedAt: '2026-11-05T06:30:00.000Z',
  }
  const taken = {
    outcome: 'Taken',
    scheduleId: schedule.id,
    dueAt: '2026-11-05T06:30:00.000Z',
    takenAt: '2026-11-05T06:20:00.000Z',
    quantity: 0.5,
  }
  let command
  const operations = createScheduleOperations({
    requireUser: async () => ({ id: 'google:alice' }),
    send: async (value) => {
      command = value
      return { schedules: [schedule], records: [skipped, taken] }
    },
    now: () => now,
  })
  const today = (await operations.snapshot()).today
  assert.equal(command.operation, 'listOutcomes')
  assert.deepEqual(
    today.doses.map((dose) => dose.status),
    ['Not logged', 'Skipped', 'Taken'],
  )
  assert.equal(today.next.dueAt, '2026-11-06T05:00:00.000Z')
})

test('recordSkipped authenticates and validates before dispatch, deriving owner from session', async () => {
  const sent = []
  const operations = createScheduleOperations({
    requireUser: async () => ({ id: 'google:alice' }),
    send: async (command) => {
      sent.push(command)
      return {
        records: [
          { ...command.record, outcome: 'Skipped', recordedAt: '2026-11-05T06:30:00.000Z' },
        ],
      }
    },
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
