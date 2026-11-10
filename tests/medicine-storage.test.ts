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
      if (file === '0007_interval_schedules.sql') {
        await db
          .prepare('INSERT INTO skipped_dose_records VALUES(?,?,?,?,?)')
          .bind(
            legacy.ownerId,
            legacy.scheduleId,
            '2026-11-06T06:00:00.000Z',
            '2026-11-06T06:01:00.000Z',
            'Skipped',
          )
          .run()
        await db
          .prepare('INSERT INTO dose_corrections VALUES(?,?,?,?,?,?,?,?,?,?)')
          .bind(
            legacy.ownerId,
            legacy.scheduleId,
            '2026-11-06T06:00:00.000Z',
            1,
            '10000000-0000-4000-8000-000000000003',
            'Skipped',
            'Taken',
            '2026-11-06T06:02:00.000Z',
            1,
            '2026-11-06T06:03:00.000Z',
          )
          .run()
      }
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
  // Exercise Worker decoding directly, independent of the Next.js contract adapter.
  for (const [quantity, valid] of [
    [4503599627370495, true],
    [4503599627370495.5, false],
    [4503599627370496, false],
  ] as const) {
    const boundaryCapsule = { ...capsule, id: randomUUID() }
    const save = () =>
      send({
        operation: 'save',
        ownerId: 'google:quantity-boundary',
        schedule: {
          ...input,
          id: randomUUID(),
          medicineId: boundaryCapsule.id,
          times: [{ time: '09:00', quantity }],
        },
      })
    await call({
      operation: 'save',
      ownerId: 'google:quantity-boundary',
      medicine: boundaryCapsule,
    })
    if (valid) await save()
    else await assert.rejects(save, /validation/)
  }
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
  assert.equal(body.schedules[0].intervalHours, null)
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

test('Interval schedules save, retry and track only real elapsed occurrences through the application boundary', async () => {
  let now = new Date('2026-11-03T07:00:00.000Z') // 10:00 Istanbul
  const handler = createWorker(() => now)
  const db = await runtime.getD1Database('DB')
  const ownerId = 'google:interval'
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
  const makeInput = async (intervalHours: number): Promise<DailyScheduleInput> => {
    const tablet = { ...medicine, id: randomUUID() }
    await call({ operation: 'save', ownerId, medicine: tablet })
    return {
      id: randomUUID(),
      medicineId: tablet.id,
      startDate: '2026-11-03',
      times: [{ time: '08:00', quantity: 1 }],
      intervalHours,
    }
  }
  for (const intervalHours of [1, 7, 24]) {
    const input = await makeInput(intervalHours)
    const saved = await operations.save(input)
    assert.equal(saved[0].intervalHours, intervalHours)
    assert.deepEqual(saved[0].weekdays, [0, 1, 2, 3, 4, 5, 6])
    assert.deepEqual(await operations.save(input), saved)
    await assert.rejects(
      () => operations.save({ ...input, intervalHours: intervalHours === 1 ? 7 : 1 }),
      /conflict/,
    )
  }
  const input = await makeInput(8)
  // Direct Worker input also rejects invalid values, without relying on the application parser.
  for (const intervalHours of [0, -1, 1.5, 25])
    await assert.rejects(
      () => send({ operation: 'save', ownerId, schedule: { ...input, intervalHours } }),
      /validation/,
    )
  await assert.rejects(
    () =>
      send({
        operation: 'save',
        ownerId,
        schedule: { ...input, times: [...input.times, { time: '16:00', quantity: 1 }] },
      }),
    /validation/,
  )
  await assert.rejects(() => operations.save({ ...input, startDate: '2026-11-02' }), /validation/)
  const saved = await operations.save(input)
  const today = (await operations.snapshot()).today
  assert.deepEqual(
    today.doses.filter((d) => d.scheduleId === input.id).map((d) => d.dueAt),
    ['2026-11-03T13:00:00.000Z'],
  )
  const dueAt = '2026-11-03T13:00:00.000Z'
  now = new Date('2026-11-04T00:00:00.000Z')
  const taken = await operations.recordTaken({
    scheduleId: input.id,
    dueAt,
    takenAt: '2026-11-03T20:15:00.000Z',
    quantity: 1,
  })
  assert.equal(taken.dueAt, dueAt)
  const skipped = await operations.recordSkipped({
    scheduleId: input.id,
    dueAt: '2026-11-03T21:00:00.000Z',
  })
  assert.equal(skipped.outcome, 'Skipped')
  const correction = await operations.correctOutcome({
    scheduleId: input.id,
    dueAt,
    actionId: randomUUID(),
    expectedRevision: 0,
    expectedOutcome: 'Taken',
    outcome: 'Skipped',
  })
  assert.equal(correction.revision, 1)
  assert.equal(
    (await operations.history('2026-11-03')).find((d) => d.scheduleId === input.id)?.status,
    'Skipped',
  )
  assert.deepEqual(
    (await operations.snapshot()).today.doses
      .filter((d) => d.scheduleId === input.id)
      .map((d) => d.dueAt),
    ['2026-11-03T21:00:00.000Z', '2026-11-04T05:00:00.000Z', '2026-11-04T13:00:00.000Z'],
  )
  assert.equal((await operations.snapshot()).today.next?.dueAt, '2026-11-04T00:00:00.000Z') // hourly schedule is Due now
  assert.deepEqual(await operations.save(input), saved) // retry after midnight preserves cutoff
  for (const invalid of ['2026-11-03T05:00:00.000Z', '2026-11-03T14:00:00.000Z']) {
    await assert.rejects(
      () =>
        operations.recordTaken({
          scheduleId: input.id,
          dueAt: invalid,
          takenAt: now.toISOString(),
          quantity: 1,
        }),
      /validation/,
    )
    await assert.rejects(
      () => operations.recordSkipped({ scheduleId: input.id, dueAt: invalid }),
      /validation/,
    )
    await assert.rejects(
      () =>
        operations.correctOutcome({
          scheduleId: input.id,
          dueAt: invalid,
          actionId: randomUUID(),
          expectedRevision: 0,
          expectedOutcome: 'Taken',
          outcome: 'Skipped',
        }),
      /validation/,
    )
  }
})

test('Interval end cutoff excludes midnight while retaining earlier doses for recording and correction', async () => {
  let now = new Date('2026-11-03T04:00:00.000Z')
  const handler = createWorker(() => now)
  const db = await runtime.getD1Database('DB')
  const ownerId = 'google:interval-end'
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
    endDate: '2026-11-03',
    times: [{ time: '08:00', quantity: 1 }],
    intervalHours: 8,
  }
  await operations.save(input)
  now = new Date('2026-11-04T09:00:00.000Z')
  const dueAt = '2026-11-03T13:00:00.000Z'
  await operations.recordSkipped({ scheduleId: input.id, dueAt })
  await operations.correctOutcome({
    scheduleId: input.id,
    dueAt,
    actionId: randomUUID(),
    expectedRevision: 0,
    expectedOutcome: 'Skipped',
    outcome: 'Taken',
    takenAt: now.toISOString(),
    quantity: 1,
  })
  assert.deepEqual(
    (await operations.history('2026-11-03')).map((d) => [d.dueAt, d.status]),
    [
      ['2026-11-03T05:00:00.000Z', 'Not logged'],
      [dueAt, 'Taken'],
    ],
  )
  assert.deepEqual((await operations.snapshot()).today.doses, [])
  assert.equal((await operations.snapshot()).today.next, null)
  await assert.rejects(
    () => operations.recordSkipped({ scheduleId: input.id, dueAt: '2026-11-03T21:00:00.000Z' }),
    /validation/,
  )
})

async function versionFixture() {
  let now = new Date('2026-11-02T04:00:00.000Z')
  const handler = createWorker(() => now)
  const db = await runtime.getD1Database('DB')
  const ownerId = `google:${randomUUID()}`
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
    if (!response.ok)
      throw Object.assign(new Error((body as { error: string }).error), { status: response.status })
    return body as ScheduleResponse<C>
  }
  const operations = createScheduleOperations({
    requireUser: async () => ({ id: ownerId }),
    send,
    now: () => now,
  })
  return {
    operations,
    send,
    medicineId: tablet.id,
    setNow: (value: string) => {
      now = new Date(value)
    },
  }
}

test('Schedule versions preserve the D3 Edit time boundary and list only the current version', async () => {
  for (const [editTime, oldTime, newTime, expected] of [
    ['05:59:59', '09:00', '10:00', ['2026-11-03T07:00:00.000Z']],
    ['06:00:00', '09:00', '10:00', ['2026-11-03T06:00:00.000Z', '2026-11-03T07:00:00.000Z']],
    ['06:00:01', '09:00', '10:00', ['2026-11-03T06:00:00.000Z', '2026-11-03T07:00:00.000Z']],
    ['06:00:00', '10:00', '09:00', []],
  ] as const) {
    const f = await versionFixture()
    const id = randomUUID()
    await f.operations.save({
      id,
      medicineId: f.medicineId,
      startDate: '2026-11-02',
      times: [{ time: oldTime, quantity: 1 }],
    })
    f.setNow(`2026-11-03T${editTime}.000Z`)
    const editedId = randomUUID()
    await f.operations.edit({
      id: editedId,
      basedOnId: id,
      endDate: null,
      times: [{ time: newTime, quantity: 1 }],
    })
    const snapshot = await f.operations.snapshot()
    assert.deepEqual(
      snapshot.schedules.map((s) => s.id),
      [editedId],
    )
    assert.deepEqual(
      snapshot.today.doses.map((d) => d.dueAt),
      expected,
    )
    if (expected.length === 0) assert.equal(snapshot.today.next?.dueAt, '2026-11-04T06:00:00.000Z')
  }
})

test('Schedule versions retain early Taken outcomes, prior History and earlier-version recording and corrections', async () => {
  const f = await versionFixture()
  const id = randomUUID()
  await f.operations.save({
    id,
    medicineId: f.medicineId,
    startDate: '2026-11-02',
    times: [{ time: '10:00', quantity: 1 }],
  })
  f.setNow('2026-11-03T05:30:00.000Z')
  const past = await f.operations.history('2026-11-02')
  const dueAt = '2026-11-03T07:00:00.000Z'
  await f.operations.recordTaken({
    scheduleId: id,
    dueAt,
    takenAt: '2026-11-03T05:30:00.000Z',
    quantity: 1,
  })
  f.setNow('2026-11-03T06:00:00.000Z')
  await f.operations.edit({
    id: randomUUID(),
    basedOnId: id,
    endDate: null,
    times: [{ time: '11:00', quantity: 1 }],
  })
  assert.deepEqual(
    (await f.operations.snapshot()).today.doses.map((d) => [d.dueAt, d.status]),
    [
      [dueAt, 'Taken'],
      ['2026-11-03T08:00:00.000Z', 'Upcoming'],
    ],
  )
  assert.deepEqual(await f.operations.history('2026-11-02'), past)
  await f.operations.correctOutcome({
    scheduleId: id,
    dueAt,
    actionId: randomUUID(),
    expectedRevision: 0,
    expectedOutcome: 'Taken',
    outcome: 'Skipped',
  })
  assert.equal((await f.operations.snapshot()).today.doses[0].status, 'Skipped')
  await f.operations.recordSkipped({ scheduleId: id, dueAt: '2026-11-02T07:00:00.000Z' })
  assert.equal((await f.operations.history('2026-11-02'))[0].status, 'Skipped')
  f.setNow('2026-11-04T09:00:00.000Z')
  await assert.rejects(
    () => f.operations.recordSkipped({ scheduleId: id, dueAt: '2026-11-04T07:00:00.000Z' }),
    /validation/,
  )
})

test('Schedule versions switch Clock and Interval and preserve an Interval Anchor when hours change', async () => {
  const f = await versionFixture()
  const clockId = randomUUID()
  await f.operations.save({
    id: clockId,
    medicineId: f.medicineId,
    startDate: '2026-11-02',
    times: [{ time: '08:00', quantity: 1 }],
  })
  f.setNow('2026-11-03T06:00:00.000Z')
  const past = await f.operations.history('2026-11-02')
  await f.operations.recordSkipped({ scheduleId: clockId, dueAt: '2026-11-03T05:00:00.000Z' })
  const intervalId = randomUUID()
  const switchInput = {
    id: intervalId,
    basedOnId: clockId,
    endDate: null,
    intervalHours: 8,
    times: [{ time: '08:00', quantity: 1 }],
  }
  await assert.rejects(() => f.operations.edit(switchInput), /validation/)
  await f.operations.edit({ ...switchInput, anchorDate: '2026-11-03' })
  assert.deepEqual(
    (await f.operations.snapshot()).today.doses.map((d) => [d.dueAt, d.status]),
    [
      ['2026-11-03T05:00:00.000Z', 'Skipped'],
      ['2026-11-03T13:00:00.000Z', 'Upcoming'],
    ],
  )
  f.setNow('2026-11-03T10:00:00.000Z')
  const hoursId = randomUUID()
  const [hours] = await f.operations.edit({
    id: hoursId,
    basedOnId: intervalId,
    endDate: null,
    intervalHours: 6,
    times: [{ time: '08:00', quantity: 1 }],
  })
  assert.equal(hours.startDate, '2026-11-03')
  assert.equal((await f.operations.snapshot()).today.next?.dueAt, '2026-11-03T11:00:00.000Z')
  await f.operations.recordTaken({
    scheduleId: hoursId,
    dueAt: '2026-11-03T11:00:00.000Z',
    takenAt: '2026-11-03T10:00:00.000Z',
    quantity: 1,
  })
  f.setNow('2026-11-03T11:00:00.000Z')
  await f.operations.edit({
    id: randomUUID(),
    basedOnId: hoursId,
    endDate: null,
    times: [{ time: '15:00', quantity: 2 }],
  })
  assert.deepEqual(
    (await f.operations.snapshot()).today.doses.map((d) => [d.dueAt, d.status]),
    [
      ['2026-11-03T05:00:00.000Z', 'Skipped'],
      ['2026-11-03T11:00:00.000Z', 'Taken'],
      ['2026-11-03T12:00:00.000Z', 'Upcoming'],
    ],
  )
  assert.deepEqual(await f.operations.history('2026-11-02'), past)
})

test('Schedule version edits reject stale or changed attempts and other owners; retries retain Edit time', async () => {
  const f = await versionFixture()
  const id = randomUUID()
  await f.operations.save({
    id,
    medicineId: f.medicineId,
    startDate: '2026-11-02',
    times: [{ time: '09:00', quantity: 1 }],
  })
  f.setNow('2026-11-03T06:00:00.000Z')
  const edit = {
    id: randomUUID(),
    basedOnId: id,
    endDate: null,
    times: [{ time: '10:00', quantity: 1 }],
  }
  const outsider = createScheduleOperations({
    requireUser: async () => ({ id: 'google:outsider' }),
    send: f.send,
  })
  await assert.rejects(() => outsider.edit(edit), { status: 400 })
  const anonymous = createScheduleOperations({
    requireUser: async () => {
      throw new Error('unauthorized')
    },
    send: f.send,
  })
  await assert.rejects(() => anonymous.edit(edit), /unauthorized/)
  const saved = await f.operations.edit(edit)
  f.setNow('2026-11-04T06:00:00.000Z')
  assert.deepEqual(await f.operations.edit(edit), saved)
  await assert.rejects(
    () => f.operations.edit({ ...edit, times: [{ time: '11:00', quantity: 1 }] }),
    { status: 409 },
  )
  await assert.rejects(() => f.operations.edit({ ...edit, id: randomUUID() }), { status: 409 })
  for (const extra of [{ startDate: '2026-11-05' }, { medicineId: f.medicineId }])
    await assert.rejects(() => f.operations.edit({ ...edit, ...extra }), /validation/)
  const next = {
    id: randomUUID(),
    basedOnId: edit.id,
    endDate: null,
    times: [{ time: '12:00', quantity: 1 }],
  }
  const races = await Promise.allSettled([
    f.operations.edit(next),
    f.operations.edit({ ...next, id: randomUUID() }),
  ])
  assert.equal(races.filter((r) => r.status === 'fulfilled').length, 1)
  const rejected = races.find((r) => r.status === 'rejected') as PromiseRejectedResult
  assert.equal(rejected.reason.status, 409)
  const [replayed] = await f.operations.edit(edit)
  assert.equal(replayed.confirmedAt, saved[0].confirmedAt)
  assert.equal((await f.operations.snapshot()).schedules.length, 1)
})

test('Schedule version migration preserves pre-existing Skipped outcomes and correction revisions', async () => {
  const response = await runtime.dispatchFetch('http://worker/schedules', {
    method: 'POST',
    headers: { authorization: `Bearer ${secret}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      operation: 'listOutcomes',
      ownerId: legacy.ownerId,
      date: '2026-11-06',
    }),
  })
  assert.equal(response.status, 200)
  const snapshot = (await response.json()) as ScheduleResponse<
    Extract<ScheduleCommand, { operation: 'listOutcomes' }>
  >
  assert.equal(snapshot.schedules[0].id, legacy.scheduleId)
  assert.deepEqual(
    snapshot.records.map((r) => [r.scheduleId, r.dueAt, r.outcome, r.revision, r.actionId]),
    [
      [
        legacy.scheduleId,
        '2026-11-06T06:00:00.000Z',
        'Taken',
        1,
        '10000000-0000-4000-8000-000000000003',
      ],
    ],
  )
})

test('an early recording racing an edit is either retained or rejected without restoring a replaced dose', async () => {
  const f = await versionFixture()
  const id = randomUUID()
  await f.operations.save({
    id,
    medicineId: f.medicineId,
    startDate: '2026-11-02',
    times: [{ time: '10:00', quantity: 1 }],
  })
  f.setNow('2026-11-03T06:00:00.000Z')
  const [recorded, edited] = await Promise.allSettled([
    f.operations.recordSkipped({ scheduleId: id, dueAt: '2026-11-03T07:00:00.000Z' }),
    f.operations.edit({
      id: randomUUID(),
      basedOnId: id,
      endDate: null,
      times: [{ time: '11:00', quantity: 1 }],
    }),
  ])
  assert.equal(edited.status, 'fulfilled')
  const doses = (await f.operations.snapshot()).today.doses
  assert.equal(
    doses.some((d) => d.scheduleId === id),
    recorded.status === 'fulfilled',
  )
  if (recorded.status === 'rejected') assert.ok([400, 409].includes(recorded.reason.status))
  else assert.equal(doses[0].status, 'Skipped')
})

test('Last day today keeps earlier doses and includes the final evening only', async () => {
  const f = await versionFixture()
  const id = randomUUID()
  const times = [
    { time: '09:00', quantity: 1 },
    { time: '21:00', quantity: 1 },
  ]
  await f.operations.save({ id, medicineId: f.medicineId, startDate: '2026-11-02', times })
  f.setNow('2026-11-03T07:00:00.000Z')
  const edit = { id: randomUUID(), basedOnId: id, times, endDate: '2026-11-03' }
  await assert.rejects(() => f.operations.edit({ ...edit, endDate: '2026-11-02' }), /validation/)
  const [saved] = await f.operations.edit(edit)
  assert.equal(saved.endDate, '2026-11-03')
  assert.deepEqual(
    (await f.operations.snapshot()).today.doses.map((d) => [d.scheduleId, d.dueAt]),
    [
      [id, '2026-11-03T06:00:00.000Z'],
      [edit.id, '2026-11-03T18:00:00.000Z'],
    ],
  )
  f.setNow('2026-11-04T07:00:00.000Z')
  const snapshot = await f.operations.snapshot()
  assert.deepEqual(snapshot.today.doses, [])
  assert.equal(snapshot.today.next, null)
  assert.equal((await f.operations.history('2026-11-03')).length, 2)
  const key = { scheduleId: id, dueAt: '2026-11-03T06:00:00.000Z' }
  await f.operations.recordSkipped(key)
  await f.operations.correctOutcome({
    ...key,
    actionId: randomUUID(),
    expectedRevision: 0,
    expectedOutcome: 'Skipped',
    outcome: 'Taken',
    takenAt: '2026-11-04T07:00:00.000Z',
    quantity: 1,
  })
  assert.equal((await f.operations.history('2026-11-03'))[0].status, 'Taken')
})

test('Last day changes require an explicit valid day and retain the day sent with a time change', async () => {
  const f = await versionFixture()
  const id = randomUUID()
  const input = {
    id,
    medicineId: f.medicineId,
    startDate: '2026-11-05',
    times: [{ time: '09:00', quantity: 1 }],
    intervalHours: 8,
    endDate: '2026-11-06',
  }
  for (const intervalHours of [null, 8])
    await assert.rejects(
      () => f.operations.save({ ...input, intervalHours, endDate: '2026-11-04' }),
      /validation/,
    )
  const saved = await f.operations.save(input)
  f.setNow('2026-11-03T07:00:00.000Z')
  const edit = {
    id: randomUUID(),
    basedOnId: id,
    times: input.times,
    intervalHours: 6,
    endDate: '2026-11-06',
  }
  for (const endDate of [undefined, '', '2026-02-30', '2026-11-02', '2026-11-04']) {
    await assert.rejects(() => f.operations.edit({ ...edit, endDate }), /validation/)
  }
  await assert.rejects(() => f.operations.edit({ ...edit, anchorDate: '2026-11-07' }), /validation/)
  const [changed] = await f.operations.edit(edit)
  assert.equal(changed.endDate, '2026-11-06')
  assert.equal(changed.startDate, '2026-11-05')
  f.setNow('2026-11-08T07:00:00.000Z')
  assert.deepEqual(await f.operations.save(input), [
    { ...saved[0], replacedAt: '2026-11-03T07:00:00.000Z' },
  ])
  assert.deepEqual(await f.operations.edit(edit), [changed])
  await assert.rejects(() => f.operations.edit({ ...edit, endDate: null }), { status: 409 })
  await assert.rejects(() => f.operations.edit({ ...edit, id: randomUUID(), endDate: null }), {
    status: 409,
  })
  const outsider = createScheduleOperations({
    requireUser: async () => ({ id: 'google:outsider' }),
    send: f.send,
  })
  await assert.rejects(
    () => outsider.edit({ ...edit, id: randomUUID(), basedOnId: changed.id, endDate: null }),
    { status: 400 },
  )
})

test('Ended schedules restart after the Edit time without restoring doses in the gap', async () => {
  for (const intervalHours of [null, 12]) {
    for (const endDate of ['2026-11-06', null]) {
      const f = await versionFixture()
      const id = randomUUID()
      const times = intervalHours
        ? [{ time: '09:00', quantity: 1 }]
        : [
            { time: '09:00', quantity: 1 },
            { time: '21:00', quantity: 1 },
          ]
      await f.operations.save({
        id,
        medicineId: f.medicineId,
        startDate: '2026-11-02',
        times,
        intervalHours,
        endDate: '2026-11-03',
      })
      f.setNow('2026-11-05T07:00:00.000Z')
      assert.equal((await f.operations.snapshot()).today.next, null)
      const past = await f.operations.history('2026-11-03')
      const edit = { id: randomUUID(), basedOnId: id, times, intervalHours, endDate }
      await f.operations.edit(edit)
      assert.deepEqual(
        (await f.operations.snapshot()).today.doses.map((d) => [d.scheduleId, d.dueAt]),
        [[edit.id, '2026-11-05T18:00:00.000Z']],
      )
      assert.deepEqual(await f.operations.history('2026-11-04'), [])
      assert.deepEqual(await f.operations.history('2026-11-05'), [])
      assert.deepEqual(await f.operations.history('2026-11-03'), past)
    }
  }
})

test('Final day and End preserves history keep the 23:30 dose recordable and correctable', async () => {
  const f = await versionFixture()
  const id = randomUUID()
  await f.operations.save({
    id,
    medicineId: f.medicineId,
    startDate: '2026-11-02',
    times: [{ time: '23:30', quantity: 1 }],
    endDate: '2026-11-03',
  })
  f.setNow('2026-11-03T20:00:00.000Z')
  assert.equal((await f.operations.snapshot()).today.next?.dueAt, '2026-11-03T20:30:00.000Z')
  f.setNow('2026-11-04T07:00:00.000Z')
  assert.equal((await f.operations.snapshot()).today.next, null)
  assert.deepEqual(
    (await f.operations.history('2026-11-03')).map((d) => [d.dueAt, d.status]),
    [['2026-11-03T20:30:00.000Z', 'Not logged']],
  )
  assert.deepEqual(await f.operations.history('2026-11-04'), [])
  const key = { scheduleId: id, dueAt: '2026-11-03T20:30:00.000Z' }
  await f.operations.recordSkipped(key)
  await f.operations.correctOutcome({
    ...key,
    actionId: randomUUID(),
    expectedRevision: 0,
    expectedOutcome: 'Skipped',
    outcome: 'Taken',
    takenAt: '2026-11-04T07:00:00.000Z',
    quantity: 1,
  })
  assert.equal((await f.operations.history('2026-11-03'))[0].status, 'Taken')
})
