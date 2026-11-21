import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'vitest'
import { createWorker } from '../worker/index'
import { createMedicineOperations } from '../src/features/medicines/operations'
import type { MedicineRecord } from '../src/features/medicines/contract'
import { startWorkerRuntime, secret, runtime } from './helpers/medicine-storage-runtime'

startWorkerRuntime()
async function fixture() {
  const ownerId = `google:${randomUUID()}`
  const db = await runtime.getD1Database('DB')
  let now = new Date('2026-11-19T10:00:00.000Z')
  const handler = createWorker(() => now)
  const medicine = { id: randomUUID(), label: 'Example', strength: null, unit: 'tablet' }
  const send = async (command: object) => {
    const response = await handler.fetch(
      new Request('http://worker/medicines', {
        method: 'POST',
        headers: { authorization: `Bearer ${secret}` },
        body: JSON.stringify({ ownerId, ...command }),
      }),
      { DB: db, MEDICINES_WORKER_SECRET: secret },
    )
    return {
      status: response.status,
      body: (await response.json()) as { medicines: MedicineRecord[] },
    }
  }
  const key = (expectedRevision: number) => ({
    actionId: randomUUID(),
    medicineId: medicine.id,
    expectedRevision,
  })
  return {
    ownerId,
    db,
    medicine,
    send,
    key,
    setNow: (at: string) => {
      now = new Date(at)
    },
  }
}

test('Low-stock threshold saves replay once, survive tracking changes and derive the boundary on reads', async () => {
  const f = await fixture()
  await f.send({ operation: 'save', medicine: { ...f.medicine, startingCount: 5 } })
  const command = {
    operation: 'stockThreshold',
    stock: { ...f.key(0), unit: 'tablet', threshold: 5 },
  }
  const [saved, retry] = await Promise.all([f.send(command), f.send(command)])
  assert.equal(saved.status, 200)
  assert.deepEqual(retry, saved)
  assert.deepEqual(
    (
      await f.db
        .prepare('SELECT count,kind FROM stock_movements WHERE owner_id=?')
        .bind(f.ownerId)
        .all()
    ).results,
    [{ count: 5, kind: 'startingCount' }],
  )
  const read = async () => (await f.send({ operation: 'list' })).body.medicines[0]
  assert.deepEqual((await read()).stock, { tracked: true, count: 5, threshold: 5 })
  const operations = createMedicineOperations({
    requireUser: async () => ({ id: f.ownerId }),
    send: async (command) => {
      const result = await f.send(command)
      assert.equal(result.status, 200)
      return result.body.medicines
    },
  })
  const raised = await operations.stockThreshold({ ...f.key(1), unit: 'tablet', threshold: 6 })
  assert.deepEqual(raised[0].stock, { tracked: true, count: 5, threshold: 6, low: true })
  assert.deepEqual((await read()).stock, raised[0].stock)
  await operations.stockThreshold({ ...f.key(2), unit: 'tablet', threshold: null })
  assert.deepEqual((await read()).stock, { tracked: true, count: 5 })
  await operations.stockThreshold({ ...f.key(3), unit: 'tablet', threshold: 6 })
  await f.send({ operation: 'stockOff', stock: f.key(4) })
  assert.deepEqual((await read()).stock, { tracked: false, threshold: 6 })
  await f.send({ operation: 'stockOn', stock: { ...f.key(5), unit: 'tablet', startingCount: 4 } })
  assert.deepEqual((await read()).stock, { tracked: true, count: 4, threshold: 6, low: true })
  await f.send({ operation: 'archive', archive: f.key(6) })
  assert.deepEqual((await read()).stock, { tracked: true, count: 4, threshold: 6 })
  assert.deepEqual(await f.send(command), saved)
})

test('dose saves, refills, Count corrections and threshold edits share the raw Stock boundary', async () => {
  const f = await fixture()
  await f.send({ operation: 'save', medicine: { ...f.medicine, startingCount: 5.5 } })
  const read = async () => (await f.send({ operation: 'list' })).body.medicines[0].stock
  const save = async (operation: string, revision: number, values: object) => {
    const result = await f.send({
      operation,
      stock: { ...f.key(revision), unit: 'tablet', ...values },
    })
    assert.equal(result.status, 200)
  }
  f.setNow('2026-11-19T10:45:00.000Z')
  await save('stockThreshold', 0, { threshold: 5 })
  const dose = async (quantity: number, takenAt = '2026-11-19T10:30:00.000Z') => {
    const response = await createWorker(() => new Date('2026-11-19T11:00:00.000Z')).fetch(
      new Request('http://worker/schedules', {
        method: 'POST',
        headers: { authorization: `Bearer ${secret}` },
        body: JSON.stringify({
          ownerId: f.ownerId,
          operation: 'saveUnscheduled',
          dose: {
            actionId: randomUUID(),
            medicineId: f.medicine.id,
            takenAt,
            quantity,
          },
        }),
      }),
      { DB: f.db, MEDICINES_WORKER_SECRET: secret },
    )
    assert.equal(response.status, 200, await response.text())
  }
  await dose(0.5)
  assert.deepEqual(await read(), { tracked: true, count: 5, threshold: 5 })
  await dose(0.5)
  assert.deepEqual(await read(), { tracked: true, count: 4.5, threshold: 5, low: true })
  await save('stockRefill', 1, { amount: 0.5 })
  assert.deepEqual(await read(), { tracked: true, count: 5, threshold: 5 })
  await save('stockCorrection', 2, { count: 4 })
  assert.deepEqual(await read(), { tracked: true, count: 4, threshold: 5, low: true })
  await save('stockThreshold', 3, { threshold: 4 })
  assert.deepEqual(await read(), { tracked: true, count: 4, threshold: 4 })
  await dose(5, '2026-11-19T10:50:00.000Z')
  assert.deepEqual(await read(), {
    tracked: true,
    count: 0,
    threshold: 4,
    low: true,
    intakePastCount: true,
  })
  await save('stockThreshold', 4, { threshold: null })
  assert.deepEqual(await read(), { tracked: true, count: 0, intakePastCount: true })
})

test('refused threshold saves leave the Medicine, movements and receipts unchanged', async () => {
  const f = await fixture()
  await f.send({ operation: 'save', medicine: { ...f.medicine, startingCount: 5 } })
  const command = {
    operation: 'stockThreshold',
    stock: { ...f.key(0), unit: 'tablet', threshold: 6 },
  }
  const saved = await f.send(command)
  assert.equal(saved.status, 200)
  const snapshot = async () => ({
    read: await f.send({ operation: 'list' }),
    actions: (
      await f.db
        .prepare('SELECT * FROM medicine_stock_actions WHERE owner_id=?')
        .bind(f.ownerId)
        .all()
    ).results,
    movements: (
      await f.db.prepare('SELECT * FROM stock_movements WHERE owner_id=?').bind(f.ownerId).all()
    ).results,
  })
  let before = await snapshot()
  for (const [stock, status, ownerId] of [
    [{ ...f.key(0), unit: 'tablet', threshold: 7 }, 409, f.ownerId],
    [{ ...command.stock, threshold: 7 }, 409, f.ownerId],
    [{ ...f.key(1), unit: 'capsule', threshold: 7 }, 409, f.ownerId],
    [{ ...f.key(1), unit: 'tablet', threshold: 7 }, 404, 'google:other'],
    ...[0, -1, 0.1, Number.MAX_SAFE_INTEGER].map(
      (threshold) => [{ ...f.key(1), unit: 'tablet', threshold }, 400, f.ownerId] as const,
    ),
  ] as const) {
    assert.equal((await f.send({ operation: 'stockThreshold', stock, ownerId })).status, status)
    assert.deepEqual(await snapshot(), before)
  }
  await f.send({ operation: 'stockOff', stock: f.key(1) })
  before = await snapshot()
  assert.equal(
    (
      await f.send({
        operation: 'stockThreshold',
        stock: { ...f.key(2), unit: 'tablet', threshold: null },
      })
    ).status,
    409,
  )
  assert.deepEqual(await snapshot(), before)
  await f.send({ operation: 'stockOn', stock: { ...f.key(2), unit: 'tablet', startingCount: 1 } })
  await f.send({ operation: 'archive', archive: f.key(3) })
  before = await snapshot()
  assert.equal(
    (
      await f.send({
        operation: 'stockThreshold',
        stock: { ...f.key(4), unit: 'tablet', threshold: 7 },
      })
    ).status,
    409,
  )
  assert.deepEqual(await snapshot(), before)
  assert.deepEqual(await f.send(command), saved)
})

test('changing Type clears the retained threshold even when its number fits the new Quantity unit', async () => {
  for (const threshold of [4.5, 5]) {
    const f = await fixture()
    await f.send({ operation: 'save', medicine: { ...f.medicine, startingCount: 10 } })
    assert.equal(
      (
        await f.send({
          operation: 'stockThreshold',
          stock: { ...f.key(0), unit: 'tablet', threshold },
        })
      ).status,
      200,
    )
    await f.send({ operation: 'stockOff', stock: f.key(1) })
    const corrected = await f.send({
      operation: 'correctDetails',
      correction: {
        ...f.key(2),
        strengthRevisionId: f.medicine.id,
        label: 'Example',
        strength: null,
        unit: 'capsule',
      },
    })
    assert.equal(corrected.status, 200)
    assert.deepEqual(corrected.body.medicines[0].stock, { tracked: false })
    const enabled = await f.send({
      operation: 'stockOn',
      stock: {
        ...f.key(3),
        unit: 'capsule',
        startingCount: 1,
      },
    })
    assert.equal(enabled.status, 200)
    assert.deepEqual(enabled.body.medicines[0].stock, { tracked: true, count: 1 })
    assert.deepEqual((await f.send({ operation: 'list' })).body.medicines[0].stock, {
      tracked: true,
      count: 1,
    })
  }
})
