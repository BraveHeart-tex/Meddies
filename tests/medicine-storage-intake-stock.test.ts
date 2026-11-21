// Real-D1 proofs for #47: dose saves change Stock once, atomically with the dose write.
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'vitest'
import { createWorker } from '../worker/index'
import { createMedicineOperations } from '../src/features/medicines/operations'
import { createScheduleOperations } from '../src/features/schedules/operations'
import type { ScheduleCommand, ScheduleResponse } from '../src/features/schedules/contract'
import type { MedicineRecord } from '../src/features/medicines/contract'
import {
  startWorkerRuntime,
  secret,
  runtime,
  stockBackfill,
} from './helpers/medicine-storage-runtime'

startWorkerRuntime()

// Istanbul 09:00-20:00 on 2026-11-19 is 06:00Z-17:00Z; stock starts at 10:00:40Z.
const due = (hourUtc: number) => `2026-11-19T${String(hourUtc).padStart(2, '0')}:00:00.000Z`

async function fixture(unit: 'tablet' | 'liquid' = 'tablet', startingCount = 30) {
  let now = new Date('2026-11-19T04:00:00.000Z')
  const handler = createWorker(() => now)
  const db = await runtime.getD1Database('DB')
  const ownerId = `google:${randomUUID()}`
  const medicineId = randomUUID()
  const env = { DB: db, MEDICINES_WORKER_SECRET: secret }
  const post = async (path: string, command: object) => {
    const response = await handler.fetch(
      new Request(`http://worker/${path}`, {
        method: 'POST',
        headers: { authorization: `Bearer ${secret}` },
        body: JSON.stringify({ ownerId, ...command }),
      }),
      env,
    )
    return { status: response.status, body: (await response.json()) as Record<string, unknown> }
  }
  const medicines = async () =>
    ((await post('medicines', { operation: 'list' })).body.medicines as MedicineRecord[])[0]
  const operations = createScheduleOperations({
    requireUser: async () => ({ id: ownerId }),
    send: async <C extends ScheduleCommand>(command: C) => {
      const { status, body } = await post('schedules', command)
      if (status !== 200) throw Object.assign(new Error(body.error as string), { status })
      return body as ScheduleResponse<C>
    },
    now: () => now,
  })
  await post('medicines', {
    operation: 'save',
    medicine: { id: medicineId, label: 'Example', strength: null, unit },
  })
  const [schedule] = await operations.save({
    id: randomUUID(),
    medicineId,
    startDate: '2026-11-19',
    times: Array.from({ length: 12 }, (_, index) => ({
      time: `${String(index + 9).padStart(2, '0')}:00`,
      quantity: 1,
    })),
  })
  const stockAt = async (count: number | null, at: string) => {
    now = new Date(at)
    const { revision } = await medicines()
    const result = await post('medicines', {
      operation: count === null ? 'stockOff' : 'stockOn',
      stock: {
        actionId: randomUUID(),
        medicineId,
        expectedRevision: revision,
        ...(count === null ? {} : { unit, startingCount: count }),
      },
    })
    assert.equal(result.status, 200)
  }
  await stockAt(startingCount, '2026-11-19T10:00:40.000Z')
  now = new Date('2026-11-19T17:30:00.000Z')
  const occurrence = (hourUtc: number) => ({ scheduleId: schedule.id, dueAt: due(hourUtc) })
  const taken = (hourUtc: number, quantity = 1, takenAt = due(hourUtc)) =>
    operations.recordTaken({ ...occurrence(hourUtc), takenAt, quantity })
  const unscheduled = (takenAt: string, quantity = 1) =>
    operations.saveUnscheduled({ actionId: randomUUID(), medicineId, takenAt, quantity })
  const stock = async () => (await medicines()).stock
  const stored = async () =>
    (
      await db
        .prepare('SELECT stock_count AS count FROM user_medications WHERE owner_id=? AND id=?')
        .bind(ownerId, medicineId)
        .first<{ count: number | null }>()
    )?.count
  const movements = async () =>
    (
      await db
        .prepare(
          'SELECT count_change AS change FROM intake_stock_movements WHERE owner_id=? ORDER BY rowid',
        )
        .bind(ownerId)
        .all<{ change: number }>()
    ).results.map((row) => row.change)
  return {
    db,
    ownerId,
    medicineId,
    post,
    setNow: (at: string) => {
      now = new Date(at)
    },
    medicines,
    operations,
    occurrence,
    taken,
    unscheduled,
    stock,
    stored,
    movements,
    stockAt,
  }
}

test('refills add once, reconcile only past the count, and refuse invalid writes atomically', async () => {
  for (const startingCount of [30, 1, 0.5]) {
    const f = await fixture('tablet', startingCount)
    await f.taken(11)
    const past = startingCount < 1
    const before = await f.medicines()
    const intakeBefore = await f.movements()
    f.setNow('2026-11-19T12:00:40.000Z')
    const refill = {
      operation: 'stockRefill',
      stock: {
        actionId: randomUUID(),
        medicineId: f.medicineId,
        expectedRevision: before.revision,
        unit: 'tablet',
        amount: 30,
      },
    }
    const send = (command: object) => f.post('medicines', command)
    const snapshot = async () => ({
      medicine: await f.medicines(),
      actions: (
        await f.db
          .prepare('SELECT * FROM medicine_stock_actions WHERE owner_id=? ORDER BY rowid')
          .bind(f.ownerId)
          .all()
      ).results,
      movements: (
        await f.db
          .prepare('SELECT * FROM stock_movements WHERE owner_id=? ORDER BY rowid')
          .bind(f.ownerId)
          .all()
      ).results,
    })
    const unchanged = await snapshot()
    for (const [stock, status] of [
      [{ ...refill.stock, expectedRevision: before.revision - 1 }, 409],
      [{ ...refill.stock, unit: 'capsule' }, 409],
      [{ ...refill.stock, amount: 0 }, 400],
      [{ ...refill.stock, amount: -1 }, 400],
      [{ ...refill.stock, amount: 0.1 }, 400],
    ] as const) {
      assert.equal((await send({ ...refill, stock })).status, status)
      assert.deepEqual(await snapshot(), unchanged)
    }
    assert.equal((await send({ ...refill, ownerId: `google:${randomUUID()}` })).status, 404)
    assert.deepEqual(await snapshot(), unchanged)
    const [saved, retry] = await Promise.all([send(refill), send(refill)])
    assert.equal(saved.status, 200)
    assert.deepEqual(retry, saved)
    assert.deepEqual(await f.stock(), { tracked: true, count: past ? 30 : startingCount + 29 })
    assert.equal((await f.medicines()).revision, before.revision + 1)
    assert.deepEqual(await f.movements(), intakeBefore)
    const movements = (
      await f.db
        .prepare(
          'SELECT count,unit,occurred_at,kind FROM stock_movements WHERE owner_id=? AND kind=?',
        )
        .bind(f.ownerId, 'refill')
        .all()
    ).results
    assert.deepEqual(movements, [
      { count: 30, unit: 'tablet', occurred_at: '2026-11-19T12:00:40.000Z', kind: 'refill' },
    ])
    const changed = await snapshot()
    assert.equal((await send({ ...refill, stock: { ...refill.stock, amount: 31 } })).status, 409)
    assert.deepEqual(await snapshot(), changed)
    f.setNow('2026-11-19T17:30:00.000Z')
    await f.operations.correctOutcome({
      ...f.occurrence(11),
      actionId: randomUUID(),
      expectedRevision: 0,
      expectedOutcome: 'Taken',
      outcome: 'Skipped',
    })
    assert.deepEqual(await f.stock(), { tracked: true, count: past ? 30 : startingCount + 30 })
    await f.taken(10, 1, '2026-11-19T11:59:00.000Z')
    assert.deepEqual(await f.stock(), { tracked: true, count: past ? 30 : startingCount + 29 })
    await f.taken(12)
    assert.deepEqual(await f.stock(), { tracked: true, count: past ? 29 : startingCount + 28 })
    assert.deepEqual(await send(refill), saved)
    await f.stockAt(null, '2026-11-19T18:00:00.000Z')
    const off = await snapshot()
    const next = {
      ...refill,
      stock: {
        ...refill.stock,
        actionId: randomUUID(),
        expectedRevision: (await f.medicines()).revision,
      },
    }
    assert.equal((await send(next)).status, 409)
    assert.deepEqual(await snapshot(), off)
    await f.stockAt(1, '2026-11-19T18:01:00.000Z')
    await send({
      operation: 'archive',
      archive: {
        actionId: randomUUID(),
        medicineId: f.medicineId,
        expectedRevision: (await f.medicines()).revision,
      },
    })
    const archived = await snapshot()
    assert.equal(
      (
        await send({
          ...next,
          stock: { ...next.stock, expectedRevision: (await f.medicines()).revision },
        })
      ).status,
      409,
    )
    assert.deepEqual(await snapshot(), archived)
    assert.deepEqual(await send(refill), saved)
  }
  for (const [unit, maximum, step] of [
    ['tablet', 4503599627370495.5, 0.5],
    ['liquid', 900719925474099, 0.1],
  ] as const) {
    const f = await fixture(unit, maximum)
    const before = await f.medicines()
    assert.equal(
      (
        await f.post('medicines', {
          operation: 'stockRefill',
          stock: {
            actionId: randomUUID(),
            medicineId: f.medicineId,
            expectedRevision: before.revision,
            unit,
            amount: step,
          },
        })
      ).status,
      409,
    )
    assert.deepEqual(await f.medicines(), before)
    assert.deepEqual(
      await f.db
        .prepare('SELECT count(*) AS n FROM stock_movements WHERE owner_id=?')
        .bind(f.ownerId)
        .first(),
      { n: 1 },
    )
  }
  const liquid = await fixture('liquid', 0.1)
  const operations = createMedicineOperations({
    requireUser: async () => ({ id: liquid.ownerId }),
    send: async (command) => {
      const { status, body } = await liquid.post('medicines', command)
      if (status !== 200) throw new Error(body.error as string)
      return body.medicines as MedicineRecord[]
    },
  })
  for (const count of [0.2, 0.3]) {
    const [confirmed] = await operations.stockRefill({
      actionId: randomUUID(),
      medicineId: liquid.medicineId,
      expectedRevision: (await liquid.medicines()).revision,
      unit: 'liquid',
      amount: 0.1,
    })
    assert.deepEqual(confirmed.stock, { tracked: true, count })
    assert.deepEqual(await liquid.stock(), confirmed.stock)
  }
})

test('a count correction reconciles Stock once without rewriting intake history', async () => {
  const f = await fixture('tablet', 1)
  await f.taken(11, 2)
  assert.deepEqual(await f.stock(), { tracked: true, count: 0, intakePastCount: true })
  f.setNow('2026-11-19T12:00:40.000Z')
  const before = await f.medicines()
  const { revision } = before
  const correction = (expectedRevision: number, count: number) => ({
    operation: 'stockCorrection',
    stock: {
      actionId: randomUUID(),
      medicineId: f.medicineId,
      expectedRevision,
      unit: 'tablet',
      count,
    },
  })
  const command = correction(revision, 0)
  const correct = (input: object) => f.post('medicines', input)
  assert.equal((await correct(correction(revision - 1, 4))).status, 409)
  assert.equal((await correct({ ...command, ownerId: `google:${randomUUID()}` })).status, 404)
  assert.equal((await correct({ ...command, stock: { ...command.stock, count: -1 } })).status, 400)
  assert.equal(
    (await correct({ ...command, stock: { ...command.stock, unit: 'capsule' } })).status,
    409,
  )
  assert.deepEqual(await f.medicines(), before)
  const saved = await correct(command)
  assert.equal(saved.status, 200)
  assert.deepEqual(await f.stock(), { tracked: true, count: 0 })
  assert.deepEqual(await f.movements(), [-2])

  f.setNow('2026-11-19T13:00:40.000Z')
  assert.equal((await correct(correction(revision + 1, 0))).status, 200)
  assert.deepEqual(await correct(command), saved)
  await f.taken(12)
  await f.operations.correctOutcome({
    ...f.occurrence(11),
    actionId: randomUUID(),
    expectedRevision: 0,
    expectedOutcome: 'Taken',
    outcome: 'Taken',
    takenAt: due(11),
    quantity: 3,
  })
  assert.deepEqual(await f.movements(), [-2])
  await f.taken(13)
  assert.deepEqual(await f.movements(), [-2, -1])
  assert.equal(await f.stored(), -1)
  await f.stockAt(null, '2026-11-19T14:00:00.000Z')
  assert.equal((await correct(correction(revision + 3, 4))).status, 409)
  assert.equal((await f.medicines()).revision, revision + 3)
  await f.stockAt(1, '2026-11-19T14:01:00.000Z')
  assert.equal(
    (
      await correct({
        operation: 'archive',
        archive: {
          actionId: randomUUID(),
          medicineId: f.medicineId,
          expectedRevision: revision + 4,
        },
      })
    ).status,
    200,
  )
  assert.equal((await correct(correction(revision + 5, 4))).status, 409)
  assert.equal((await f.medicines()).revision, revision + 5)
  assert.deepEqual(await correct(command), saved)
  const { results } = await f.db
    .prepare(
      'SELECT count,unit,occurred_at FROM stock_movements WHERE owner_id=? AND kind=? ORDER BY occurred_at',
    )
    .bind(f.ownerId, 'countCorrection')
    .all()
  assert.deepEqual(results, [
    { count: 0, unit: 'tablet', occurred_at: '2026-11-19T12:00:40.000Z' },
    { count: 0, unit: 'tablet', occurred_at: '2026-11-19T13:00:40.000Z' },
  ])
  assert.deepEqual(await f.stock(), { tracked: true, count: 1 })
})

test('Taken first logs lower Stock by their quantity, including Unscheduled and Archived; Skipped changes nothing', async () => {
  const f = await fixture()
  await f.taken(11)
  assert.deepEqual(await f.stock(), { tracked: true, count: 29 })
  await f.taken(12, 0.5)
  await f.operations.recordSkipped(f.occurrence(13))
  assert.deepEqual(await f.stock(), { tracked: true, count: 28.5 })
  await f.unscheduled('2026-11-19T14:10:00.000Z', 2)
  assert.deepEqual(await f.stock(), { tracked: true, count: 26.5 })
  const { revision } = await f.medicines()
  const archived = await f.post('medicines', {
    operation: 'archive',
    archive: { actionId: randomUUID(), medicineId: f.medicineId, expectedRevision: revision },
  })
  assert.equal(archived.status, 200)
  await f.taken(14)
  const medicine = await f.medicines()
  assert.ok(medicine.archivedAt)
  assert.deepEqual(medicine.stock, { tracked: true, count: 25.5 })
  assert.deepEqual(await f.movements(), [-1, -0.5, -2, -1])
})

test('liquid intake stays exact to 0.1 ml', async () => {
  const f = await fixture('liquid', 0.3)
  for (const minute of ['10', '20', '30'])
    await f.unscheduled(`2026-11-19T14:${minute}:00.000Z`, 0.1)
  assert.equal(await f.stored(), 0)
  assert.deepEqual(await f.stock(), { tracked: true, count: 0 })
  await f.unscheduled('2026-11-19T14:40:00.000Z', 0.1)
  assert.equal(await f.stored(), -0.1)
})

test('a Taken time in a minute before the reconciliation point changes nothing; the same minute counts', async () => {
  const f = await fixture()
  await f.taken(8)
  await f.unscheduled('2026-11-19T09:59:00.000Z')
  assert.deepEqual(await f.stock(), { tracked: true, count: 30 })
  await f.taken(10, 1, '2026-11-19T10:00:00.000Z')
  assert.deepEqual(await f.stock(), { tracked: true, count: 29 })
  assert.deepEqual(await f.movements(), [-1])
})

test('corrections, Unscheduled changes and removals change Stock by the version difference', async () => {
  const f = await fixture()
  const correct = (hourUtc: number, expectedRevision: number, change: object) =>
    f.operations.correctOutcome({
      ...f.occurrence(hourUtc),
      actionId: randomUUID(),
      expectedRevision,
      ...change,
    })
  await f.taken(12)
  await correct(12, 0, { expectedOutcome: 'Taken', outcome: 'Skipped' })
  assert.deepEqual(await f.stock(), { tracked: true, count: 30 })
  await correct(12, 1, {
    expectedOutcome: 'Skipped',
    outcome: 'Taken',
    takenAt: due(12),
    quantity: 1,
  })
  await correct(12, 2, {
    expectedOutcome: 'Taken',
    outcome: 'Taken',
    takenAt: due(12),
    quantity: 2,
  })
  assert.deepEqual(await f.stock(), { tracked: true, count: 28 })
  await correct(12, 3, {
    expectedOutcome: 'Taken',
    outcome: 'Taken',
    takenAt: '2026-11-19T09:00:00.000Z',
    quantity: 2,
  })
  assert.deepEqual(await f.stock(), { tracked: true, count: 30 })
  await f.operations.recordSkipped(f.occurrence(13))
  await correct(13, 0, {
    expectedOutcome: 'Skipped',
    outcome: 'Taken',
    takenAt: due(13),
    quantity: 0.5,
  })
  assert.deepEqual(await f.stock(), { tracked: true, count: 29.5 })

  const dose = await f.unscheduled('2026-11-19T14:10:00.000Z')
  const change = (expectedRevision: number, value: object) =>
    f.operations.changeUnscheduled({
      actionId: randomUUID(),
      doseId: dose.id,
      expectedRevision,
      ...value,
    })
  await change(0, { removed: false, takenAt: dose.takenAt, quantity: 3 })
  assert.deepEqual(await f.stock(), { tracked: true, count: 26.5 })
  await change(1, { removed: false, takenAt: '2026-11-19T09:30:00.000Z', quantity: 3 })
  assert.deepEqual(await f.stock(), { tracked: true, count: 29.5 })
  await change(2, { removed: false, takenAt: dose.takenAt, quantity: 1 })
  await change(3, { removed: true })
  assert.deepEqual(await f.stock(), { tracked: true, count: 29.5 })
})

test('intake past the count shows 0 with the flag, and a correction restores the true remainder', async () => {
  const f = await fixture('tablet', 0.5)
  await f.taken(12)
  assert.equal(await f.stored(), -0.5)
  assert.deepEqual(await f.stock(), { tracked: true, count: 0, intakePastCount: true })
  await f.operations.correctOutcome({
    ...f.occurrence(12),
    actionId: randomUUID(),
    expectedRevision: 0,
    expectedOutcome: 'Taken',
    outcome: 'Skipped',
  })
  assert.deepEqual(await f.stock(), { tracked: true, count: 0.5 })
  await f.unscheduled('2026-11-19T14:10:00.000Z', 0.5)
  assert.deepEqual(await f.stock(), { tracked: true, count: 0 })
})

test('dose saves with stock off change no Stock, and a fresh count stands', async () => {
  const f = await fixture()
  await f.stockAt(null, '2026-11-19T11:00:00.000Z')
  await f.taken(9, 1, '2026-11-19T11:00:00.000Z')
  const dose = await f.unscheduled('2026-11-19T11:00:00.000Z')
  await f.operations.changeUnscheduled({
    actionId: randomUUID(),
    doseId: dose.id,
    expectedRevision: 0,
    removed: true,
  })
  assert.deepEqual(await f.stock(), { tracked: false })
  assert.deepEqual(await f.movements(), [])
  await f.stockAt(10, '2026-11-19T12:00:00.000Z')
  await f.operations.correctOutcome({
    ...f.occurrence(9),
    actionId: randomUUID(),
    expectedRevision: 0,
    expectedOutcome: 'Taken',
    outcome: 'Skipped',
  })
  assert.deepEqual(await f.stock(), { tracked: true, count: 10 })
})

test('retries, concurrent identical saves and rejected writes apply each stock change at most once', async () => {
  const f = await fixture()
  const taken = { ...f.occurrence(12), takenAt: due(12), quantity: 1 }
  await Promise.all([f.operations.recordTaken(taken), f.operations.recordTaken(taken)])
  await f.operations.recordTaken(taken)
  await assert.rejects(() => f.operations.recordTaken({ ...taken, quantity: 2 }), /conflict/)
  await f.operations.recordSkipped(f.occurrence(13))
  await assert.rejects(
    () => f.operations.recordTaken({ ...f.occurrence(13), takenAt: due(13), quantity: 1 }),
    /conflict/,
  )
  assert.deepEqual(await f.stock(), { tracked: true, count: 29 })

  const correction = {
    ...f.occurrence(12),
    actionId: randomUUID(),
    expectedRevision: 0,
    expectedOutcome: 'Taken' as const,
    outcome: 'Taken' as const,
    takenAt: due(12),
    quantity: 3,
  }
  await Promise.all([
    f.operations.correctOutcome(correction),
    f.operations.correctOutcome(correction),
  ])
  await f.operations.correctOutcome(correction)
  await assert.rejects(
    () => f.operations.correctOutcome({ ...correction, actionId: randomUUID(), quantity: 5 }),
    /conflict/,
  )
  assert.deepEqual(await f.stock(), { tracked: true, count: 27 })

  const dose = { actionId: randomUUID(), medicineId: f.medicineId, takenAt: due(14), quantity: 2 }
  await Promise.all([f.operations.saveUnscheduled(dose), f.operations.saveUnscheduled(dose)])
  await f.operations.saveUnscheduled(dose)
  const removal = {
    actionId: randomUUID(),
    doseId: dose.actionId,
    expectedRevision: 0,
    removed: true,
  }
  await f.operations.changeUnscheduled(removal)
  await f.operations.changeUnscheduled(removal)
  await assert.rejects(
    () =>
      f.operations.changeUnscheduled({
        actionId: randomUUID(),
        doseId: dose.actionId,
        expectedRevision: 0,
        removed: false,
        takenAt: due(14),
        quantity: 1,
      }),
    /conflict/,
  )
  assert.deepEqual(await f.stock(), { tracked: true, count: 27 })
  assert.deepEqual(await f.movements(), [-1, -2, -2, 2])
})

test('migration counts doses saved after a starting count once, at their latest version', async () => {
  const db = await runtime.getD1Database('DB')
  const row = await db
    .prepare('SELECT stock_count AS count FROM user_medications WHERE owner_id=? AND id=?')
    .bind(stockBackfill.ownerId, stockBackfill.medicineId)
    .first<{ count: number }>()
  assert.equal(row?.count, 8.5)
  const changes = await db
    .prepare(
      'SELECT count_change AS change FROM intake_stock_movements WHERE owner_id=? ORDER BY dose_key',
    )
    .bind(stockBackfill.ownerId)
    .all<{ change: number }>()
  assert.deepEqual(
    changes.results.map((item) => item.change),
    [-1, -0.5],
  )
})
