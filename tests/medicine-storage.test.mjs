import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { after, before, test } from 'node:test'
import { readFile } from 'node:fs/promises'
import { createWorker } from '../worker/index.ts'
import { createScheduleOperations } from '../src/features/schedules/operations.ts'
import { Miniflare, convertV4MiniflareOptions } from 'miniflare'

let runtime
const secret = 'synthetic-worker-secret-at-least-32-characters'
const medicine = { id: randomUUID(), label: 'Vitamin D3', strength: '1000 IU', unit: 'tablet' }
const call = (command, authorization = `Bearer ${secret}`) =>
  runtime.dispatchFetch('http://worker/medicines', {
    method: 'POST',
    headers: { authorization, 'content-type': 'application/json' },
    body: JSON.stringify(command),
  })
before(async () => {
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
  await db.exec(
    (await readFile('worker/migrations/0001_user_medications.sql', 'utf8')).replaceAll('\n', ' '),
  )
  await db.exec(
    (await readFile('worker/migrations/0002_daily_schedules.sql', 'utf8')).replaceAll('\n', ' '),
  )
  for (const statement of (await readFile('worker/migrations/0003_dose_records.sql', 'utf8')).split(
    ';',
  )) {
    if (statement.trim()) await db.exec(statement.trim().replaceAll('\n', ' '))
  }
})
after(async () => {
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
  const capsule = { ...medicine, id: randomUUID(), unit: 'capsule' }
  await call({ operation: 'save', ownerId: 'google:scheduler', medicine: capsule })
  const send = async (command) => {
    const response = await runtime.dispatchFetch('http://worker/schedules', {
      method: 'POST',
      headers: { authorization: `Bearer ${secret}` },
      body: JSON.stringify(command),
    })
    const body = await response.json()
    if (!response.ok) throw new Error(body.error)
    return body
  }
  const operations = createScheduleOperations({
    requireUser: async () => ({ id: 'google:scheduler' }),
    send,
  })
  const input = {
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
  const send = async (command) => {
    const response = await handler.fetch(
      new Request('http://worker/schedules', {
        method: 'POST',
        headers: { authorization: `Bearer ${secret}` },
        body: JSON.stringify(command),
      }),
      { DB: db, MEDICINES_WORKER_SECRET: secret },
    )
    const body = await response.json()
    if (!response.ok) throw new Error(body.error)
    return body
  }
  const operations = createScheduleOperations({
    requireUser: async () => ({ id: ownerId }),
    send,
    now: () => now,
  })
  const input = {
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
  assert.equal(before.today.next.dueAt, '2026-11-03T21:00:00.000Z')
  now = new Date('2026-11-03T21:00:00.000Z')
  assert.deepEqual(await operations.save(input), saved)
  const midnight = await operations.snapshot()
  assert.equal(midnight.today.doses[0].id, before.today.next.id)
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

test('late half-tablet intake persists once without moving the next dose', async () => {
  let now = new Date('2026-11-04T05:00:00.000Z')
  const handler = createWorker(() => now)
  const db = await runtime.getD1Database('DB')
  const ownerId = 'google:intake'
  const tablet = { ...medicine, id: randomUUID() }
  await call({ operation: 'save', ownerId, medicine: tablet })
  const send = async (command) => {
    const response = await handler.fetch(
      new Request('http://worker/schedules', {
        method: 'POST',
        headers: { authorization: `Bearer ${secret}` },
        body: JSON.stringify(command),
      }),
      { DB: db, MEDICINES_WORKER_SECRET: secret },
    )
    const body = await response.json()
    if (!response.ok) throw new Error(body.error)
    return body
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
  await assert.rejects(() => send({ operation: 'delivered', ownerId, record: input }), /validation/)
  assert.equal((await operations.snapshot()).today.doses[0].status, 'Not logged')
  const [first, retry] = await Promise.all([
    operations.recordTaken(input),
    operations.recordTaken(input),
  ])
  assert.deepEqual(first, retry)
  await assert.rejects(() => operations.recordTaken({ ...input, quantity: 1 }), /conflict/)
  const today = (await operations.snapshot()).today
  assert.equal(today.doses[0].status, 'Taken')
  assert.equal(today.doses[0].dueAt, '2026-11-04T06:00:00.000Z')
  assert.equal(today.doses[0].quantity, 1)
  assert.equal(today.doses[0].record.takenAt, input.takenAt)
  assert.equal(today.doses[0].record.quantity, 0.5)
  assert.deepEqual(today.next, before.next)

  const capsule = { ...medicine, id: randomUUID(), unit: 'capsule' }
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
