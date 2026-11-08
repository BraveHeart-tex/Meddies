import type {
  SkippedDoseRecord,
  DoseRecord,
  DoseOccurrence,
} from '../src/features/schedules/contract'
import type { Medicine } from '../src/features/medicines/contract'
import type {
  DailyScheduleInput,
  DoseCorrectionInput,
  ScheduleCommand,
  ScheduleResponse,
  SendSchedule,
  DoseOutcomeRecord,
} from '../src/features/schedules/contract'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, test } from 'vitest'
import { createWorker } from '../worker/index'
import { createScheduleOperations } from '../src/features/schedules/operations'
import { Miniflare, convertV4MiniflareOptions } from 'miniflare'
import { applyD1Migrations } from './helpers/d1-migrations.mjs'

let runtime: Miniflare
const secret = 'synthetic-worker-secret-at-least-32-characters'
const medicine: Medicine = {
  id: randomUUID(),
  label: 'Vitamin D3',
  strength: '1000 IU',
  unit: 'tablet',
}
const legacy = {
  ownerId: 'google:legacy-migration',
  medicineId: '10000000-0000-4000-8000-000000000001',
  scheduleId: '10000000-0000-4000-8000-000000000002',
  dueAt: '2026-11-05T06:00:00.000Z',
  date: '2026-11-05',
  quantity: 0.5,
  takenAt: '2026-11-05T05:50:00.000Z',
}
const call = (command: unknown, authorization = `Bearer ${secret}`) =>
  runtime.dispatchFetch('http://worker/medicines', {
    method: 'POST',
    headers: { authorization, 'content-type': 'application/json' },
    body: JSON.stringify(command),
  })
beforeAll(async () => {
  runtime = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      scriptPath: '.worker-build/index.js',
      compatibilityDate: '2026-11-03',
      d1Databases: ['DB'],
      bindings: { MEDICINES_WORKER_SECRET: secret },
    }),
  )
  const db = await runtime.getD1Database('DB')
  await applyD1Migrations(db, {
    async afterMigration(file) {
      if (file !== '0003_dose_records.sql') return
      await db
        .prepare('INSERT INTO user_medications(owner_id,id,label,strength,unit) VALUES(?,?,?,?,?)')
        .bind(legacy.ownerId, legacy.medicineId, 'Legacy dose', null, 'tablet')
        .run()
      await db
        .prepare(
          'INSERT INTO daily_schedules(owner_id,id,medicine_id,start_date,times,confirmed_at) VALUES(?,?,?,?,?,?)',
        )
        .bind(
          legacy.ownerId,
          legacy.scheduleId,
          legacy.medicineId,
          legacy.date,
          '[{"time":"09:00","quantity":1}]',
          '2026-11-04T20:00:00.000Z',
        )
        .run()
      await db
        .prepare(
          'INSERT INTO dose_records(owner_id,schedule_id,due_at,taken_at,quantity,outcome) VALUES(?,?,?,?,?,?)',
        )
        .bind(
          legacy.ownerId,
          legacy.scheduleId,
          legacy.dueAt,
          legacy.takenAt,
          legacy.quantity,
          'Taken',
        )
        .run()
    },
  })
})
afterAll(async () => {
  await runtime?.dispose()
})

test('real D1 save survives reload; concurrent retries have one effect and remain owner scoped', async () => {
  const command = { operation: 'save', ownerId: 'google:alice', medicine }
  const responses = await Promise.all([call(command), call(command)])
  for (const response of responses) {
    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), { medicines: [medicine] })
  }
  assert.equal((await call(command)).status, 200)
  const reload = await call({ operation: 'list', ownerId: 'google:alice' })
  assert.deepEqual(await reload.json(), { medicines: [medicine] })
  const other = await call({ operation: 'list', ownerId: 'google:bob' })
  assert.deepEqual(await other.json(), { medicines: [] })
  assert.equal(
    (await call({ ...command, medicine: { ...medicine, label: 'Changed' } })).status,
    409,
  )
  assert.equal((await call(command, 'Bearer wrong')).status, 401)
})

test('daily schedules persist in D1 with owner checks, capsule quantities and safe concurrent retries', async () => {
  const capsule: Medicine = { ...medicine, id: randomUUID(), unit: 'capsule' }
  await call({ operation: 'save', ownerId: 'google:scheduler', medicine: capsule })
  const send: SendSchedule = async <C extends ScheduleCommand>(command: C) => {
    const response = await runtime.dispatchFetch('http://worker/schedules', {
      method: 'POST',
      headers: { authorization: `Bearer ${secret}` },
      body: JSON.stringify(command),
    })
    const body = await response.json()
    if (!response.ok) throw new Error((body as { error: string }).error)
    return body as ScheduleResponse<C>
  }
  const operations = createScheduleOperations({
    requireUser: async () => ({ id: 'google:scheduler' }),
    send,
  })
  const input: DailyScheduleInput = {
    id: randomUUID(),
    medicineId: capsule.id,
    startDate: '2099-12-31',
    times: [
      { time: '23:59', quantity: 2 },
      { time: '00:00', quantity: 1 },
    ],
  }
  await assert.rejects(
    () => operations.save({ ...input, times: [{ time: '09:00', quantity: 0.5 }] }),
    /validation/,
  )
  const saved = await Promise.all([operations.save(input), operations.save(input)])
  assert.deepEqual(saved[0], saved[1])
  assert.deepEqual((await operations.snapshot()).schedules, saved[0])
  assert.deepEqual(await operations.save(input), saved[0])
  assert.equal(saved[0][0].times[0].time, '00:00')
  assert(Number.isFinite(Date.parse(saved[0][0].confirmedAt)))
  await assert.rejects(() => operations.save({ ...input, startDate: '2099-12-30' }), /conflict/)
  await assert.rejects(() => operations.save({ ...input, id: randomUUID() }), /conflict/)
  const bob = createScheduleOperations({ requireUser: async () => ({ id: 'google:bob' }), send })
  assert.deepEqual((await bob.snapshot()).schedules, [])
  await assert.rejects(() => bob.save({ ...input, id: randomUUID() }), /validation/)
  await assert.rejects(
    () => operations.save({ ...input, id: randomUUID(), startDate: '2020-01-01' }),
    /validation/,
  )
})

test('real D1 save confirmation enforces Istanbul start boundaries and survives an ambiguous midnight retry', async () => {
  let now = new Date('2026-11-03T20:59:00.000Z')
  const handler = createWorker(() => now)
  const db = await runtime.getD1Database('DB')
  const ownerId = 'google:controlled-clock'
  const tablet = { ...medicine, id: randomUUID() }
  await call({ operation: 'save', ownerId, medicine: tablet })
  const send: SendSchedule = async <C extends ScheduleCommand>(command: C) => {
    const response = await handler.fetch(
      new Request('http://worker/schedules', {
        method: 'POST',
        headers: { authorization: `Bearer ${secret}` },
        body: JSON.stringify(command),
      }),
      { DB: db, MEDICINES_WORKER_SECRET: secret },
    )
    const body = await response.json()
    if (!response.ok) throw new Error((body as { error: string }).error)
    return body as ScheduleResponse<C>
  }
  const operations = createScheduleOperations({
    requireUser: async () => ({ id: ownerId }),
    send,
    now: () => now,
  })
  const input: DailyScheduleInput = {
    id: randomUUID(),
    medicineId: tablet.id,
    startDate: '2026-11-03',
    times: [
      { time: '23:58', quantity: 0.5 },
      { time: '23:59', quantity: 1 },
      { time: '00:00', quantity: 1 },
    ],
  }
  const saved = await operations.save(input)
  assert.equal(saved[0].confirmedAt, '2026-11-03T20:59:00.000Z')
  const before = await operations.snapshot()
  assert.deepEqual(before.today.doses, [])
  assert.equal(before.today.next!.dueAt, '2026-11-03T21:00:00.000Z')
  now = new Date('2026-11-03T21:00:00.000Z')
  assert.deepEqual(await operations.save(input), saved)
  const midnight = await operations.snapshot()
  assert.equal(midnight.today.doses[0].id, before.today.next!.id)
  const other = { ...medicine, id: randomUUID() }
  await call({ operation: 'save', ownerId, medicine: other })
  await assert.rejects(
    () => operations.save({ ...input, id: randomUUID(), medicineId: other.id }),
    /validation/,
  )
  const next = await operations.save({
    ...input,
    id: randomUUID(),
    medicineId: other.id,
    startDate: '2026-11-04',
  })
  assert.equal(next[0].confirmedAt, '2026-11-03T21:00:00.000Z')
  assert.equal(
    (await operations.snapshot()).today.doses.filter((dose) => dose.medicineId === other.id).length,
    2,
  )
})

test('real D1 weekday schedules normalize retries, preserve confirmation and reject non-occurrence logging', async () => {
  let now = new Date('2026-11-08T12:00:00.000Z')
  const handler = createWorker(() => now)
  const db = await runtime.getD1Database('DB')
  const ownerId = 'google:weekday-schedule'
  const tablet = { ...medicine, id: randomUUID() }
  await call({ operation: 'save', ownerId, medicine: tablet })
  const send: SendSchedule = async <C extends ScheduleCommand>(command: C) => {
    const response = await handler.fetch(
      new Request('http://worker/schedules', {
        method: 'POST',
        headers: { authorization: `Bearer ${secret}` },
        body: JSON.stringify(command),
      }),
      { DB: db, MEDICINES_WORKER_SECRET: secret },
    )
    const body = await response.json()
    if (!response.ok) throw new Error((body as { error: string }).error)
    return body as ScheduleResponse<C>
  }
  const operations = createScheduleOperations({
    requireUser: async () => ({ id: ownerId }),
    send,
    now: () => now,
  })
  const input: DailyScheduleInput = {
    id: randomUUID(),
    medicineId: tablet.id,
    startDate: '2026-11-08',
    endDate: '2026-11-09',
    weekdays: [5, 1],
    times: [{ time: '09:00', quantity: 1 }],
  }
  const saved = await operations.save(input)
  assert.deepEqual(saved[0].weekdays, [1, 5])
  now = new Date('2026-11-09T12:00:00.000Z')
  const retry = await operations.save({ ...input, weekdays: [1, 5] })
  assert.equal(retry[0].confirmedAt, saved[0].confirmedAt)
  const mondayDose = await operations.recordTaken({
    scheduleId: input.id,
    dueAt: '2026-11-09T06:00:00.000Z',
    takenAt: now.toISOString(),
    quantity: 1,
  })
  assert.equal(mondayDose.outcome, 'Taken')
  await assert.rejects(() => operations.save({ ...input, weekdays: [2] }), /conflict/)
  await assert.rejects(
    () => operations.save({ ...input, id: randomUUID(), weekdays: [1, 1] }),
    /validation/,
  )
  now = new Date('2026-11-10T12:00:00.000Z')
  await assert.rejects(
    () =>
      operations.recordTaken({
        scheduleId: input.id,
        dueAt: '2026-11-10T06:00:00.000Z',
        takenAt: now.toISOString(),
        quantity: 1,
      }),
    /validation/,
  )
  await assert.rejects(
    () =>
      operations.recordTaken({
        scheduleId: input.id,
        dueAt: '2026-11-13T06:00:00.000Z',
        takenAt: now.toISOString(),
        quantity: 1,
      }),
    /validation/,
  )
  const otherOwner = await send({ operation: 'list', ownerId: 'google:other-weekday-owner' })
  assert.deepEqual(otherOwner.schedules, [])
})

test('late half-tablet intake persists once without moving the next dose', async () => {
  let now = new Date('2026-11-04T05:00:00.000Z')
  const handler = createWorker(() => now)
  const db = await runtime.getD1Database('DB')
  const ownerId = 'google:intake'
  const tablet = { ...medicine, id: randomUUID() }
  await call({ operation: 'save', ownerId, medicine: tablet })
  const send: SendSchedule = async <C extends ScheduleCommand>(command: C) => {
    const response = await handler.fetch(
      new Request('http://worker/schedules', {
        method: 'POST',
        headers: { authorization: `Bearer ${secret}` },
        body: JSON.stringify(command),
      }),
      { DB: db, MEDICINES_WORKER_SECRET: secret },
    )
    const body = await response.json()
    if (!response.ok) throw new Error((body as { error: string }).error)
    return body as ScheduleResponse<C>
  }
  const operations = createScheduleOperations({
    requireUser: async () => ({ id: ownerId }),
    send,
    now: () => now,
  })
  const scheduleId = randomUUID()
  await operations.save({
    id: scheduleId,
    medicineId: tablet.id,
    startDate: '2026-11-04',
    times: [
      { time: '09:00', quantity: 1 },
      { time: '18:00', quantity: 1 },
    ],
  })
  now = new Date('2026-11-04T08:00:00.000Z')
  const before = (await operations.snapshot()).today
  assert.equal(before.doses[0].status, 'Not logged')
  const input = {
    scheduleId,
    dueAt: before.doses[0].dueAt,
    takenAt: '2026-11-04T07:30:00.000Z',
    quantity: 0.5,
  }
  const other = createScheduleOperations({
    requireUser: async () => ({ id: 'google:other' }),
    send,
    now: () => now,
  })
  await assert.rejects(
    () => operations.recordTaken({ ...input, takenAt: '+010000-01-01T00:00:00.000Z' }),
    /validation/,
  )
  await assert.rejects(() => other.recordTaken(input), /validation/)
  await assert.rejects(
    () => operations.recordTaken({ ...input, dueAt: '2026-11-04T06:01:00.000Z' }),
    /validation/,
  )
  // Invalid wire command deliberately bypasses the typed sender.
  await assert.rejects(
    () => send({ operation: 'delivered', ownerId, record: input } as unknown as ScheduleCommand),
    /validation/,
  )
  assert.equal((await operations.snapshot()).today.doses[0].status, 'Not logged')
  const [first, retry] = await Promise.all([
    operations.recordTaken(input),
    operations.recordTaken(input),
  ])
  assert.deepEqual(first, retry)
  await assert.rejects(() => operations.recordTaken({ ...input, quantity: 1 }), /conflict/)
  await assert.rejects(
    () => operations.recordSkipped({ scheduleId: input.scheduleId, dueAt: input.dueAt }),
    /conflict/,
  )
  const today = (await operations.snapshot()).today
  assert.equal(today.doses[0].status, 'Taken')
  assert.equal(today.doses[0].dueAt, '2026-11-04T06:00:00.000Z')
  assert.equal(today.doses[0].quantity, 1)
  assert.equal(today.doses[0].record.takenAt, input.takenAt)
  assert.equal(today.doses[0].record.quantity, 0.5)
  assert.deepEqual(today.next, before.next)

  const capsule: Medicine = { ...medicine, id: randomUUID(), unit: 'capsule' }
  await call({ operation: 'save', ownerId, medicine: capsule })
  const [capsuleSchedule] = await operations.save({
    id: randomUUID(),
    medicineId: capsule.id,
    startDate: '2026-11-04',
    times: [{ time: '22:00', quantity: 1 }],
  })
  const capsuleIntake = {
    ...input,
    scheduleId: capsuleSchedule.id,
    dueAt: '2026-11-04T19:00:00.000Z',
  }
  await assert.rejects(() => operations.recordTaken(capsuleIntake), /validation/)
  assert.equal((await operations.recordTaken({ ...capsuleIntake, quantity: 1 })).outcome, 'Taken')
  now = new Date('2026-11-04T21:00:00.000Z')
  assert.deepEqual(await operations.recordTaken(input), first)
})

test('0004 preserves pre-existing Taken rows, legacy list shape and identical Taken retries', async () => {
  const response = await runtime.dispatchFetch('http://worker/schedules', {
    method: 'POST',
    headers: { authorization: `Bearer ${secret}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      operation: 'list',
      ownerId: legacy.ownerId,
      date: legacy.date,
    }),
  })
  assert.equal(response.status, 200)
  const body = (await response.json()) as ScheduleResponse<{ operation: 'list'; ownerId: string }>
  assert.deepEqual(Object.keys(body).sort(), ['records', 'schedules'])
  assert.equal(body.records![0].outcome, 'Taken')
  assert.equal(body.records![0].quantity, legacy.quantity)
  const handler = createWorker(() => new Date('2026-11-05T08:00:00.000Z'))
  const db = await runtime.getD1Database('DB')
  const retry = await handler.fetch(
    new Request('http://worker/schedules', {
      method: 'POST',
      headers: { authorization: `Bearer ${secret}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        operation: 'recordTaken',
        ownerId: legacy.ownerId,
        record: {
          scheduleId: legacy.scheduleId,
          dueAt: legacy.dueAt,
          takenAt: legacy.takenAt,
          quantity: legacy.quantity,
        },
      }),
    }),
    { DB: db, MEDICINES_WORKER_SECRET: secret },
  )
  assert.equal(retry.status, 200)
  assert.equal((await retry.json()).records[0].takenAt, legacy.takenAt)
  const skipped = await db
    .prepare(
      `INSERT INTO skipped_dose_records (owner_id, schedule_id, due_at, recorded_at, outcome)
       SELECT owner_id, schedule_id, due_at, taken_at, 'Skipped'
       FROM dose_records WHERE owner_id = ?`,
    )
    .bind(legacy.ownerId)
    .run()
  assert.equal(skipped.meta.changes, 0)
})

test('Skipped D1 records are idempotent across midnight and triggers arbitrate cross-outcome races', async () => {
  let now = new Date('2026-11-05T08:00:00.000Z')
  const handler = createWorker(() => now)
  const db = await runtime.getD1Database('DB')
  const ownerId = 'google:skip-d1'
  const tablet = { ...medicine, id: randomUUID() }
  await call({ operation: 'save', ownerId, medicine: tablet })
  const send: SendSchedule = async <C extends ScheduleCommand>(command: C) => {
    const response = await handler.fetch(
      new Request('http://worker/schedules', {
        method: 'POST',
        headers: { authorization: `Bearer ${secret}`, 'content-type': 'application/json' },
        body: JSON.stringify(command),
      }),
      { DB: db, MEDICINES_WORKER_SECRET: secret },
    )
    const body = await response.json()
    if (!response.ok) throw new Error((body as { error: string }).error)
    return body as ScheduleResponse<C>
  }
  const operations = createScheduleOperations({
    requireUser: async () => ({ id: ownerId }),
    send,
    now: () => now,
  })
  const [schedule] = await operations.save({
    id: randomUUID(),
    medicineId: tablet.id,
    startDate: '2026-11-05',
    times: [
      { time: '11:05', quantity: 1 },
      { time: '11:10', quantity: 0.5 },
    ],
  })
  const dueAt = '2026-11-05T08:05:00.000Z'
  const input = { scheduleId: schedule.id, dueAt }
  const [first, retry] = await Promise.all([
    operations.recordSkipped(input),
    operations.recordSkipped(input),
  ])
  assert.deepEqual(first, retry)
  assert.deepEqual(first, { ...input, outcome: 'Skipped', recordedAt: now.toISOString() })
  const initialSnapshot = await send({ operation: 'listOutcomes', ownerId, date: '2026-11-05' })
  assert.deepEqual(initialSnapshot.records, [
    {
      ...first,
      takenAt: null,
      quantity: null,
      revision: 0,
      actionId: null,
    },
  ])
  const taken = await db
    .prepare(
      `INSERT INTO dose_records (owner_id, schedule_id, due_at, taken_at, quantity, outcome)
       VALUES (?, ?, ?, ?, 1, 'Taken')`,
    )
    .bind(ownerId, schedule.id, dueAt, now.toISOString())
    .run()
  assert.equal(taken.meta.changes, 0)
  now = new Date('2026-11-05T21:00:00.000Z')
  assert.deepEqual(await operations.recordSkipped(input), first)
  await assert.rejects(
    () => operations.recordTaken({ ...input, takenAt: now.toISOString(), quantity: 1 }),
    /conflict/,
  )
  const bob = createScheduleOperations({
    requireUser: async () => ({ id: 'google:bob' }),
    send,
    now: () => now,
  })
  await assert.rejects(() => bob.recordSkipped(input), /validation/)
  await assert.rejects(
    () => operations.recordSkipped({ ...input, dueAt: '2026-11-05T08:06:00.000Z' }),
    /validation/,
  )

  const raceInput = { ...input, dueAt: '2026-11-05T08:10:00.000Z' }
  const outcomes = await Promise.allSettled([
    operations.recordSkipped(raceInput),
    operations.recordTaken({ ...raceInput, takenAt: now.toISOString(), quantity: 0.5 }),
  ])
  assert.equal(outcomes.filter((item) => item.status === 'fulfilled').length, 1)
  assert.equal(outcomes.filter((item) => item.status === 'rejected').length, 1)
  const listed = await send({ operation: 'listOutcomes', ownerId, date: '2026-11-05' })
  assert.equal(
    listed.records.filter((record: DoseOutcomeRecord) => record.dueAt === dueAt).length,
    1,
  )
  assert.equal(
    (listed.records.find((record) => record.dueAt === dueAt) as SkippedDoseRecord).recordedAt,
    first.recordedAt,
  )
  assert.equal(
    listed.records.filter((record: DoseOutcomeRecord) => record.dueAt === raceInput.dueAt).length,
    1,
  )
})

test('real D1 history reload preserves a past Taken outcome and actual intake details', async () => {
  let now = new Date('2026-11-04T04:00:00.000Z')
  const handler = createWorker(() => now)
  const db = await runtime.getD1Database('DB')
  const ownerId = 'google:history-d1'
  const tablet = { ...medicine, id: randomUUID() }
  await call({ operation: 'save', ownerId, medicine: tablet })
  const send: SendSchedule = async <C extends ScheduleCommand>(command: C) => {
    const response = await handler.fetch(
      new Request('http://worker/schedules', {
        method: 'POST',
        headers: { authorization: `Bearer ${secret}` },
        body: JSON.stringify(command),
      }),
      { DB: db, MEDICINES_WORKER_SECRET: secret },
    )
    const body = await response.json()
    if (!response.ok) throw new Error((body as { error: string }).error)
    return body as ScheduleResponse<C>
  }
  const operations = createScheduleOperations({
    requireUser: async () => ({ id: ownerId }),
    send,
    now: () => now,
  })
  const [schedule] = await operations.save({
    id: randomUUID(),
    medicineId: tablet.id,
    startDate: '2026-11-04',
    times: [
      { time: '08:00', quantity: 1 },
      { time: '09:00', quantity: 1 },
      { time: '10:00', quantity: 1 },
    ],
  })
  now = new Date('2026-11-05T07:00:00.000Z')
  await operations.recordTaken({
    scheduleId: schedule.id,
    dueAt: '2026-11-04T05:00:00.000Z',
    takenAt: '2026-11-05T06:30:00.000Z',
    quantity: 0.5,
  })
  await operations.recordSkipped({
    scheduleId: schedule.id,
    dueAt: '2026-11-04T06:00:00.000Z',
  })
  const history = await operations.history('2026-11-04')
  assert.deepEqual(
    history.map((dose) => [
      dose.status,
      (dose as DoseOccurrence & { record?: Partial<DoseRecord> }).record?.takenAt ?? undefined,
      (dose as DoseOccurrence & { record?: Partial<DoseRecord> }).record?.quantity ?? undefined,
    ]),
    [
      ['Taken', '2026-11-05T06:30:00.000Z', 0.5],
      ['Skipped', undefined, undefined],
      ['Not logged', undefined, undefined],
    ],
  )
  const bob = createScheduleOperations({
    requireUser: async () => ({ id: 'google:other-history-user' }),
    send,
    now: () => now,
  })
  assert.deepEqual(await bob.history('2026-11-04'), [])
})

test('D1 correction ledger flips outcomes, replays exact actions and rejects stale revisions', async () => {
  let now = new Date('2026-11-04T04:00:00.000Z')
  const handler = createWorker(() => now)
  const db = await runtime.getD1Database('DB')
  const ownerId = 'google:correction-ledger'
  const tablet = { ...medicine, id: randomUUID() }
  await call({ operation: 'save', ownerId, medicine: tablet })
  const send: SendSchedule = async <C extends ScheduleCommand>(command: C) => {
    const response = await handler.fetch(
      new Request('http://worker/schedules', {
        method: 'POST',
        headers: { authorization: `Bearer ${secret}` },
        body: JSON.stringify(command),
      }),
      { DB: db, MEDICINES_WORKER_SECRET: secret },
    )
    const body = await response.json()
    if (!response.ok) throw new Error((body as { error: string }).error)
    return body as ScheduleResponse<C>
  }
  const operations = createScheduleOperations({
    requireUser: async () => ({ id: ownerId }),
    send,
    now: () => now,
  })
  const [schedule] = await operations.save({
    id: randomUUID(),
    medicineId: tablet.id,
    startDate: '2026-11-04',
    times: [
      { time: '09:00', quantity: 1 },
      { time: '10:00', quantity: 1 },
    ],
  })
  now = new Date('2026-11-05T07:00:00.000Z')
  const occurrence = { scheduleId: schedule.id, dueAt: '2026-11-04T06:00:00.000Z' }
  await operations.recordTaken({ ...occurrence, takenAt: '2026-11-04T06:10:00.000Z', quantity: 1 })
  const first: DoseCorrectionInput = {
    ...occurrence,
    actionId: randomUUID(),
    expectedRevision: 0,
    expectedOutcome: 'Taken',
    outcome: 'Skipped',
  }
  const firstResults = await Promise.all([
    operations.correctOutcome(first),
    operations.correctOutcome(first),
  ])
  assert.deepEqual(
    firstResults.map((result) => result.revision),
    [1, 1],
  )
  assert.equal((await operations.history('2026-11-04'))[0].status, 'Skipped')
  await assert.rejects(
    () => operations.correctOutcome({ ...first, actionId: randomUUID() }),
    /conflict/,
  )
  const second: DoseCorrectionInput = {
    ...occurrence,
    actionId: randomUUID(),
    expectedRevision: 1,
    expectedOutcome: 'Skipped',
    outcome: 'Taken',
    takenAt: '2026-11-04T06:20:00.000Z',
    quantity: 0.5,
  }
  const competing = { ...second, actionId: randomUUID(), takenAt: '2026-11-04T06:25:00.000Z' }
  const competingResults = await Promise.allSettled([
    operations.correctOutcome(second),
    operations.correctOutcome(competing),
  ])
  assert.equal(competingResults.filter((result) => result.status === 'fulfilled').length, 1)
  assert.equal(competingResults.filter((result) => result.status === 'rejected').length, 1)
  const winner = competingResults[0].status === 'fulfilled' ? second : competing
  assert.equal((await operations.correctOutcome(winner)).revision, 2)
  assert.equal(
    ((await operations.history('2026-11-04'))[0] as Extract<DoseOccurrence, { status: 'Taken' }>)
      .record.takenAt,
    winner.takenAt,
  )
  const amended: DoseCorrectionInput = {
    ...occurrence,
    actionId: randomUUID(),
    expectedRevision: 2,
    expectedOutcome: 'Taken',
    outcome: 'Taken',
    takenAt: winner.takenAt,
    quantity: 1.5,
  }
  const amendedResults = await Promise.all([
    operations.correctOutcome(amended),
    operations.correctOutcome(amended),
  ])
  assert.deepEqual(
    amendedResults.map((record) => record.revision),
    [3, 3],
  )
  assert.equal(
    ((await operations.history('2026-11-04'))[0] as Extract<DoseOccurrence, { status: 'Taken' }>)
      .record.quantity,
    1.5,
  )
  assert.equal((await operations.snapshot()).schedules[0].times[0].quantity, 1)
  assert.deepEqual(await operations.correctOutcome(first), firstResults[0])
  const legacyRead = await send({ operation: 'list', ownerId, date: '2026-11-04' })
  assert.deepEqual(legacyRead.records, [
    {
      ...occurrence,
      takenAt: '2026-11-04T06:10:00.000Z',
      quantity: 1,
      outcome: 'Taken',
    },
  ])
  const undated = await send({ operation: 'list', ownerId })
  assert.deepEqual(Object.keys(undated), ['schedules'])
  const effective = await send({ operation: 'listOutcomes', ownerId, date: '2026-11-04' })
  assert.deepEqual(effective.records, [
    {
      ...occurrence,
      takenAt: winner.takenAt,
      quantity: 1.5,
      outcome: 'Taken',
      recordedAt: now.toISOString(),
      revision: 3,
      actionId: amended.actionId,
    },
  ])
  await assert.rejects(
    () =>
      operations.recordTaken({
        ...occurrence,
        takenAt: '2026-11-04T06:10:00.000Z',
        quantity: 1,
      }),
    /conflict/,
  )
  await assert.rejects(() => operations.recordSkipped(occurrence), /conflict/)

  await assert.rejects(
    () => operations.correctOutcome({ ...second, actionId: randomUUID() }),
    /conflict/,
  )
  await assert.rejects(
    () =>
      operations.correctOutcome({
        ...second,
        actionId: randomUUID(),
        expectedRevision: 1,
        expectedOutcome: 'Skipped',
        quantity: 0.25,
      }),
    /validation/,
  )
  const bob = createScheduleOperations({
    requireUser: async () => ({ id: 'google:other-correction-user' }),
    send,
    now: () => now,
  })
  await assert.rejects(() => bob.correctOutcome(first), /validation/)
  await assert.rejects(
    () =>
      operations.correctOutcome({
        ...first,
        actionId: randomUUID(),
        dueAt: '2026-11-04T07:00:00.000Z',
      }),
    /conflict/,
  )
})
