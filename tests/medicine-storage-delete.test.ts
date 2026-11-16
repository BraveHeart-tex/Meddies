import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'vitest'
import { createWorker } from '../worker/index'
import { startWorkerRuntime, secret, runtime } from './helpers/medicine-storage-runtime'

startWorkerRuntime()

async function fixture() {
  const ownerId = `google:${randomUUID()}`
  const medicine = { id: randomUUID(), label: 'Example', strength: '200 mg', unit: 'tablet' }
  const db = await runtime.getD1Database('DB')
  const handler = createWorker(() => new Date('2026-11-02T10:00:00.000Z'))
  const send = async (command: object, path = 'medicines') => {
    const response = await handler.fetch(
      new Request(`http://worker/${path}`, {
        method: 'POST',
        headers: { authorization: `Bearer ${secret}` },
        body: JSON.stringify({ ownerId, ...command }),
      }),
      { DB: db, MEDICINES_WORKER_SECRET: secret },
    )
    return { status: response.status, body: (await response.json()) as Record<string, unknown> }
  }
  const creation = await send({ operation: 'save', medicine })
  const deletion = { actionId: randomUUID(), medicineId: medicine.id, expectedRevision: 0 }
  const remove = (input = deletion) => send({ operation: 'delete', deletion: input })
  const schedule = {
    id: randomUUID(),
    medicineId: medicine.id,
    startDate: '2026-11-02',
    times: [{ time: '20:00', quantity: 1 }],
  }
  const dose = {
    actionId: randomUUID(),
    medicineId: medicine.id,
    takenAt: '2026-11-02T09:00:00.000Z',
    quantity: 1,
  }
  return { db, ownerId, medicine, send, creation, deletion, remove, schedule, dose }
}

test('delete removes the Medicine and strength revisions and prevents creation replay', async () => {
  const f = await fixture()
  const deleted = await f.remove()
  assert.equal(deleted.status, 200)
  assert.deepEqual(deleted.body.deletion, {
    ...f.deletion,
    deletedAt: '2026-11-02T10:00:00.000Z',
  })
  assert.deepEqual((await f.send({ operation: 'list' })).body, { medicines: [] })
  const db = await runtime.getD1Database('DB')
  assert.equal(
    await db
      .prepare('SELECT id FROM medicine_strength_revisions WHERE owner_id=?')
      .bind(f.ownerId)
      .first(),
    null,
  )
  assert.deepEqual(await f.remove(), deleted)
  assert.equal((await f.send({ operation: 'save', medicine: f.medicine })).status, 409)
  assert.deepEqual((await f.send({ operation: 'list' })).body, { medicines: [] })
})

test('delete rejects foreign ownership, stale revisions and reused attempt input without writing', async () => {
  const f = await fixture()
  for (const command of [
    { operation: 'delete', deletion: { ...f.deletion, expectedRevision: 1 } },
    { operation: 'delete', deletion: f.deletion, ownerId: `google:${randomUUID()}` },
  ])
    assert.equal((await f.send(command)).status, 409)
  assert.deepEqual((await f.send({ operation: 'list' })).body, f.creation.body)
  assert.equal(
    await f.db
      .prepare('SELECT action_id FROM medicine_deletions WHERE owner_id=?')
      .bind(f.ownerId)
      .first(),
    null,
  )
  const saved = await f.remove()
  for (const input of [
    { ...f.deletion, expectedRevision: 1 },
    { ...f.deletion, medicineId: randomUUID() },
    { ...f.deletion, actionId: randomUUID() },
  ])
    assert.equal((await f.remove(input)).status, 409)
  assert.deepEqual(await f.remove(), saved)
})

test('permanent usage refuses deletion after a schedule ends or dose changes and removal', async () => {
  for (const use of ['schedule', 'dose']) {
    const f = await fixture()
    if (use === 'schedule') {
      assert.equal(
        (await f.send({ operation: 'save', schedule: f.schedule }, 'schedules')).status,
        200,
      )
      assert.equal(
        (
          await f.send(
            { operation: 'stop', stop: { id: randomUUID(), basedOnId: f.schedule.id } },
            'schedules',
          )
        ).status,
        200,
      )
    } else {
      assert.equal(
        (await f.send({ operation: 'saveUnscheduled', dose: f.dose }, 'schedules')).status,
        200,
      )
      assert.equal(
        (
          await f.send(
            {
              operation: 'changeUnscheduled',
              change: {
                actionId: randomUUID(),
                doseId: f.dose.actionId,
                expectedRevision: 0,
                removed: false,
                takenAt: '2026-11-02T09:30:00.000Z',
                quantity: 2,
              },
            },
            'schedules',
          )
        ).status,
        200,
      )
      assert.equal(
        (
          await f.send(
            {
              operation: 'changeUnscheduled',
              change: {
                actionId: randomUUID(),
                doseId: f.dose.actionId,
                expectedRevision: 1,
                removed: true,
              },
            },
            'schedules',
          )
        ).status,
        200,
      )
    }
    const before = await f.send({ operation: 'list' })
    assert.equal((await f.remove()).status, 409)
    assert.deepEqual(await f.send({ operation: 'list' }), before)
    assert.equal(
      await f.db
        .prepare('SELECT action_id FROM medicine_deletions WHERE owner_id=?')
        .bind(f.ownerId)
        .first(),
      null,
    )
  }
})

test('delete and first schedule or dose serialize to exactly one committed action in either order', async () => {
  for (const use of ['schedule', 'dose']) {
    for (const order of ['delete-first', 'use-first', 'concurrent']) {
      const f = await fixture()
      const saveFirstUse = () =>
        f.send(
          use === 'schedule'
            ? { operation: 'save', schedule: f.schedule }
            : { operation: 'saveUnscheduled', dose: f.dose },
          'schedules',
        )
      const firstUse = order === 'use-first' ? await saveFirstUse() : null
      const results =
        order === 'concurrent'
          ? await Promise.all([f.remove(), saveFirstUse()])
          : order === 'delete-first'
            ? [await f.remove(), await saveFirstUse()]
            : [await f.remove(), firstUse!]
      assert.equal(results.filter((r) => r.status === 200).length, 1)
      const deleted = results[0].status === 200
      const rows = (await f.send({ operation: 'list' })).body.medicines as unknown[]
      assert.equal(rows.length, deleted ? 0 : 1)
      const table = use === 'schedule' ? 'daily_schedules' : 'unscheduled_doses'
      const count = await f.db
        .prepare(`SELECT count(*) AS n FROM ${table} WHERE owner_id=?`)
        .bind(f.ownerId)
        .first<{ n: number }>()
      assert.equal(count?.n, deleted ? 0 : 1)
    }
  }
})

test('never-used edited, archived and restored records delete with every dependent revision', async () => {
  const f = await fixture()
  const record = (f.creation.body.medicines as { currentStrengthRevisionId: string }[])[0]
  const key = { medicineId: f.medicine.id, expectedRevision: 0, actionId: randomUUID() }
  assert.equal(
    (
      await f.send({
        operation: 'correctDetails',
        correction: {
          ...key,
          strengthRevisionId: record.currentStrengthRevisionId,
          label: 'Corrected',
          strength: '250 mg',
          unit: 'tablet',
        },
      })
    ).status,
    200,
  )
  assert.equal(
    (
      await f.send({
        operation: 'changeStrength',
        change: {
          ...key,
          expectedRevision: 1,
          actionId: randomUUID(),
          strength: '300 mg',
          effectiveAt: '2026-11-02T09:00:00.000Z',
          timeZone: 'Europe/Istanbul',
        },
      })
    ).status,
    200,
  )
  assert.equal(
    (
      await f.send({
        operation: 'archive',
        archive: { ...key, expectedRevision: 2, actionId: randomUUID() },
      })
    ).status,
    200,
  )
  assert.equal(
    (
      await f.send({
        operation: 'restore',
        restore: { ...key, expectedRevision: 3, actionId: randomUUID() },
      })
    ).status,
    200,
  )
  assert.equal((await f.remove({ ...f.deletion, expectedRevision: 4 })).status, 200)
  for (const table of [
    'medicine_strength_revisions',
    'medicine_edits',
    'medicine_archives',
    'medicine_restores',
  ]) {
    assert.equal(
      await f.db
        .prepare(`SELECT medicine_id FROM ${table} WHERE owner_id=?`)
        .bind(f.ownerId)
        .first(),
      null,
    )
  }
  // The creation guard also covers an older Worker that inserts directly.
  await f.db
    .prepare(
      'INSERT OR IGNORE INTO user_medications(owner_id,id,label,strength,unit) VALUES(?,?,?,?,?)',
    )
    .bind(f.ownerId, f.medicine.id, 'Replay', '200 mg', 'tablet')
    .run()
  assert.deepEqual((await f.send({ operation: 'list' })).body, { medicines: [] })
  // A different owner can use the same UUID.
  assert.equal(
    (await f.send({ operation: 'save', ownerId: `google:${randomUUID()}`, medicine: f.medicine }))
      .status,
    200,
  )
})

test('receipt failure rolls deletion back and leaves the same attempt retryable', async () => {
  const f = await fixture()
  await f.db
    .prepare(
      `CREATE TRIGGER deletion_receipt_failure BEFORE UPDATE OF result ON medicine_deletions
    WHEN NEW.owner_id='${f.ownerId}' BEGIN SELECT RAISE(ABORT,'receipt_failure'); END`,
    )
    .run()
  try {
    assert.equal((await f.remove()).status, 503)
    assert.deepEqual((await f.send({ operation: 'list' })).body, f.creation.body)
    assert.equal(
      await f.db
        .prepare('SELECT action_id FROM medicine_deletions WHERE owner_id=?')
        .bind(f.ownerId)
        .first(),
      null,
    )
  } finally {
    await f.db.prepare('DROP TRIGGER deletion_receipt_failure').run()
  }
  assert.equal((await f.remove()).status, 200)
})
