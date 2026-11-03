import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { after, before, test } from 'node:test'
import { readFile } from 'node:fs/promises'
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
    return body.schedules
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
  assert.deepEqual(await operations.list(), saved[0])
  assert.deepEqual(await operations.save(input), saved[0])
  assert.equal(saved[0][0].times[0].time, '00:00')
  assert(Number.isFinite(Date.parse(saved[0][0].confirmedAt)))
  await assert.rejects(() => operations.save({ ...input, startDate: '2099-12-30' }), /conflict/)
  await assert.rejects(() => operations.save({ ...input, id: randomUUID() }), /conflict/)
  const bob = createScheduleOperations({ requireUser: async () => ({ id: 'google:bob' }), send })
  assert.deepEqual(await bob.list(), [])
  await assert.rejects(() => bob.save({ ...input, id: randomUUID() }), /validation/)
  await assert.rejects(
    () => operations.save({ ...input, id: randomUUID(), startDate: '2020-01-01' }),
    /validation/,
  )
})
