import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'vitest'
import { createWorker } from '../worker/index'
import type { MedicineRecord } from '../src/features/medicines/contract'
import { startWorkerRuntime, secret, runtime } from './helpers/medicine-storage-runtime'

startWorkerRuntime()
async function fixture() {
  const ownerId = `google:${randomUUID()}`
  const db = await runtime.getD1Database('DB')
  const handler = createWorker(() => new Date('2026-11-19T10:00:00.000Z'))
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
  return { ownerId, db, medicine, send, key }
}

test('stock on/off retains reconciliation movements, locks Type and refuses Archived medicines', async () => {
  const f = await fixture()
  await f.send({ operation: 'save', medicine: f.medicine })
  const on = { ...f.key(0), unit: 'tablet', startingCount: 12.5 }
  const saved = await f.send({ operation: 'stockOn', stock: on })
  assert.equal(saved.status, 200)
  assert.deepEqual(saved.body.medicines[0].stock, { tracked: true, count: 12.5 })
  assert.deepEqual((await f.send({ operation: 'list' })).body, saved.body)
  assert.equal(
    (
      await f.send({
        operation: 'correctDetails',
        correction: {
          ...f.key(1),
          strengthRevisionId: f.medicine.id,
          label: 'Example',
          strength: null,
          unit: 'capsule',
        },
      })
    ).status,
    400,
  )
  assert.equal((await f.send({ operation: 'stockOff', stock: f.key(1) })).status, 200)
  assert.deepEqual((await f.send({ operation: 'list' })).body.medicines[0].stock, {
    tracked: false,
  })
  assert.equal(
    (await f.send({ operation: 'stockOn', stock: { ...f.key(2), unit: 'tablet' } })).status,
    400,
  )
  assert.equal(
    (
      await f.send({
        operation: 'stockOn',
        stock: { ...f.key(2), unit: 'tablet', startingCount: 0 },
      })
    ).status,
    200,
  )
  const movements = (
    await f.db
      .prepare('SELECT count,unit,occurred_at FROM stock_movements WHERE owner_id=? ORDER BY rowid')
      .bind(f.ownerId)
      .all()
  ).results
  assert.deepEqual(movements, [
    { count: 12.5, unit: 'tablet', occurred_at: '2026-11-19T10:00:00.000Z' },
    { count: 0, unit: 'tablet', occurred_at: '2026-11-19T10:00:00.000Z' },
  ])
  await f.send({ operation: 'archive', archive: f.key(3) })
  for (const operation of ['stockOn', 'stockOff'])
    assert.equal(
      (await f.send({ operation, stock: { ...f.key(4), unit: 'tablet', startingCount: 1 } }))
        .status,
      409,
    )
  assert.deepEqual((await f.send({ operation: 'list' })).body.medicines[0].stock, {
    tracked: true,
    count: 0,
  })
})

test('Add medicine atomically saves its optional count and rejects invalid counts without a record', async () => {
  const f = await fixture()
  const medicine = { ...f.medicine, startingCount: 12.5 }
  const created = await f.send({ operation: 'save', medicine })
  assert.equal(created.status, 200)
  assert.deepEqual(created.body.medicines[0].stock, { tracked: true, count: 12.5 })
  assert.deepEqual(await f.send({ operation: 'save', medicine }), created)
  assert.equal(
    (await f.send({ operation: 'save', medicine: { ...medicine, startingCount: 10 } })).status,
    409,
  )
  const bare = { ...f.medicine, id: randomUUID() }
  assert.deepEqual((await f.send({ operation: 'save', medicine: bare })).body.medicines[0].stock, {
    tracked: false,
  })
  const invalid = { ...f.medicine, id: randomUUID(), unit: 'capsule', startingCount: 7.5 }
  assert.equal((await f.send({ operation: 'save', medicine: invalid })).status, 400)
  assert.equal((await f.send({ operation: 'list' })).body.medicines.length, 2)
  // Database rejection must roll back the Medicine as well as its movement.
  await assert.rejects(() =>
    f.db
      .prepare(
        'INSERT INTO user_medications(owner_id,id,label,unit,starting_count,stock_started_at) VALUES(?,?,?,?,?,?)',
      )
      .bind(f.ownerId, invalid.id, 'Invalid', 'capsule', 7.5, '2026-11-19T10:00:00.000Z')
      .run(),
  )
  assert.equal((await f.send({ operation: 'list' })).body.medicines.length, 2)
  // Deletion removes retained counts and action receipts with the Medicine.
  assert.equal((await f.send({ operation: 'delete', deletion: f.key(0) })).status, 200)
  assert.equal(
    await f.db.prepare('SELECT id FROM stock_movements WHERE owner_id=?').bind(f.ownerId).first(),
    null,
  )
})

test('stock retries apply once, preserve receipts after later writes, and reject stale or foreign commands', async () => {
  const f = await fixture()
  await f.send({ operation: 'save', medicine: f.medicine })
  const on = { ...f.key(0), unit: 'tablet', startingCount: 30 }
  const command = { operation: 'stockOn', stock: on }
  const [a, b] = await Promise.all([f.send(command), f.send(command)])
  assert.equal(a.status, 200)
  assert.deepEqual(b, a)
  const off = { operation: 'stockOff', stock: f.key(1) }
  const disabled = await f.send(off)
  assert.equal(disabled.status, 200)
  assert.deepEqual(await f.send(off), disabled)
  assert.deepEqual(await f.send(command), a)
  for (const stock of [
    { ...on, startingCount: 31 },
    { ...on, actionId: randomUUID() },
  ])
    assert.equal((await f.send({ operation: 'stockOn', stock })).status, 409)
  assert.equal(
    (
      await f.send({
        operation: 'stockOn',
        stock: { ...f.key(2), unit: 'capsule', startingCount: 10 },
      })
    ).status,
    409,
  )
  assert.equal((await f.send({ ...command, ownerId: 'google:other' })).status, 404)
  assert.deepEqual(
    (await f.send({ operation: 'list', ownerId: 'google:other' })).body.medicines,
    [],
  )
  const movements = await f.db
    .prepare('SELECT count(*) AS n FROM stock_movements WHERE owner_id=?')
    .bind(f.ownerId)
    .first()
  assert.deepEqual(movements, { n: 1 })
})
