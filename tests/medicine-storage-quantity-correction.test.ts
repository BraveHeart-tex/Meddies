import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'vitest'
import { createWorker } from '../worker/index'
import { parseTypeCorrectionReview } from '../src/features/medicines/type-correction-contract'
import {
  legacy,
  runtime,
  secret,
  startWorkerRuntime,
  stockBackfill,
  readLowStockEpisode,
} from './helpers/medicine-storage-runtime'

startWorkerRuntime({
  history: ['0003_dose_records.sql', '0007_interval_schedules.sql', '0025_stock_tracking.sql'],
})

const date = '2026-11-05'
const dueAt = date + 'T06:00:00.000Z'
const earlier = date + 'T05:00:00.000Z'

async function fixture(startingCount?: number, target = 'capsule') {
  let now = new Date('2026-11-05T04:00:00.000Z')
  const handler = createWorker(() => now)
  const db = await runtime.getD1Database('DB')
  const ownerId = 'google:' + randomUUID()
  const medicineId = randomUUID()
  const scheduleId = randomUUID()
  const request = async (path: string, command: object, owner = ownerId, database = db) => {
    const response = await handler.fetch(
      new Request('http://worker/' + path, {
        method: 'POST',
        headers: { authorization: 'Bearer ' + secret, 'content-type': 'application/json' },
        body: JSON.stringify({ ...command, ownerId: owner }),
      }),
      { DB: database, MEDICINES_WORKER_SECRET: secret },
    )
    const body = await response.json()
    if (!response.ok) throw Object.assign(new Error(body.error), { status: response.status })
    return body
  }
  const medicines = (command: { operation: string; [key: string]: unknown }, owner?: string) =>
    request(
      ['reviewTypeCorrection', 'correctType'].includes(command.operation)
        ? 'medicine-type-correction'
        : 'medicines',
      command,
      owner,
    )
  const schedules = (command: object) => request('schedules', command)
  await medicines({
    operation: 'save',
    medicine: {
      id: medicineId,
      label: 'Example',
      strength: '200 mg',
      unit: 'tablet',
      startingCount,
    },
  })
  const schedule = {
    id: scheduleId,
    medicineId,
    startDate: date,
    times: [{ time: '09:00', quantity: 0.5 }],
  }
  const saveSchedule = () => schedules({ operation: 'save', schedule })
  await saveSchedule()
  now = new Date(date + 'T12:00:00.000Z')
  const preflight = async () =>
    parseTypeCorrectionReview(
      (
        await medicines({
          operation: 'reviewTypeCorrection',
          review: { medicineId, unit: target },
        })
      ).review,
    )
  const read = () => schedules({ operation: 'listOutcomes', date })
  const list = async () => (await medicines({ operation: 'list' })).medicines[0]
  return {
    db,
    ownerId,
    medicineId,
    scheduleId,
    medicines,
    schedules,
    saveSchedule,
    target,
    preflight,
    read,
    list,
    request,
    setNow: (instant: string) => {
      now = new Date(instant)
    },
  }
}

test('read-only preflight finds incompatible current doses and earlier Schedule versions, and Stock stays off', async () => {
  const f = await fixture(undefined, 'ovule')
  const next = randomUUID()
  await f.schedules({
    operation: 'edit',
    edit: {
      id: next,
      basedOnId: f.scheduleId,
      times: [{ time: '10:00', quantity: 1 }],
      endDate: null,
    },
  })
  const actionId = randomUUID()
  await f.schedules({
    operation: 'saveUnscheduled',
    dose: { actionId, medicineId: f.medicineId, takenAt: earlier, quantity: 1.5 },
  })
  const before = { medicine: await f.list(), snapshot: await f.read() }
  const review = await f.preflight()
  assert.deepEqual(review.conflicts, [
    { key: 'unscheduled:' + actionId, kind: 'unscheduled', quantity: 1.5, time: earlier },
    {
      key: 'schedule:' + f.scheduleId + ':0',
      kind: 'schedule',
      quantity: 0.5,
      time: '09:00',
      version: {
        id: f.scheduleId,
        startDate: date,
        confirmedAt: date + 'T04:00:00.000Z',
        replacedAt: date + 'T12:00:00.000Z',
      },
    },
  ])
  assert.equal(review.compatibleAmounts, 1)
  assert.equal(review.stockTracked, false)
  assert.deepEqual({ medicine: await f.list(), snapshot: await f.read() }, before)
  const result = await f.medicines({
    operation: 'correctType',
    correction: {
      medicineId: f.medicineId,
      unit: f.target,
      actionId: randomUUID(),
      expectedRevision: review.revision,
      reviewVersion: review.reviewVersion,
      repairs: review.conflicts.map(({ key }: { key: string }) => ({ key, quantity: 2 })),
      stockCount: null,
    },
  })
  assert.deepEqual(result.medicines[0].stock, { tracked: false })
  const snapshot = await f.read()
  assert.equal(snapshot.unscheduledDoses[0].quantity, 2)
  assert.equal(
    snapshot.schedules.find((s: { id: string }) => s.id === f.scheduleId).times[0].quantity,
    2,
  )
  assert.equal(snapshot.schedules.find((s: { id: string }) => s.id === next).times[0].quantity, 1)
})

type Fixture = Awaited<ReturnType<typeof fixture>>
async function reviewedCorrection(f: Fixture, stockCount: number | null = null) {
  const review = await f.preflight()
  return {
    medicineId: f.medicineId,
    unit: f.target,
    actionId: randomUUID(),
    expectedRevision: review.revision,
    reviewVersion: review.reviewVersion,
    repairs: review.conflicts.map(({ key }: { key: string }) => ({ key, quantity: 2 })),
    stockCount,
  }
}

test('threshold, tracking and Type changes open, preserve or end a low-stock episode', async () => {
  const f = await fixture(4)
  const episode = () => readLowStockEpisode(f.ownerId, f.medicineId)
  const stock = async (operation: string, values: object = {}) =>
    f.medicines({
      operation,
      stock: {
        actionId: randomUUID(),
        medicineId: f.medicineId,
        expectedRevision: (await f.list()).revision,
        ...values,
      },
    })
  await stock('stockThreshold', { unit: 'tablet', threshold: 5 })
  const first = await episode()
  assert.equal(first?.pushEligible, 1)
  await stock('stockThreshold', { unit: 'tablet', threshold: 6 })
  assert.deepEqual(await episode(), first)
  await stock('stockThreshold', { unit: 'tablet', threshold: 4 })
  assert.equal(await episode(), null)
  await stock('stockThreshold', { unit: 'tablet', threshold: 5 })
  const second = await episode()
  assert.equal(second?.pushEligible, 1)
  assert.notEqual(second.id, first.id)
  await stock('stockOff')
  assert.equal(await episode(), null)
  await stock('stockOn', { unit: 'tablet', startingCount: 3 })
  const third = await episode()
  assert.equal(third?.pushEligible, 1)
  assert.notEqual(third.id, second.id)

  const correction = await reviewedCorrection(f, 3)
  await f.medicines({ operation: 'correctType', correction })
  assert.deepEqual((await f.list()).stock, { tracked: true, count: 3 })
  assert.equal(await episode(), null)
})

test('correction preserves dose and Schedule identities, applies explicit repairs across Strength periods, and reconciles tracked Stock', async () => {
  const f = await fixture(10, 'ovule')
  const scheduled = { scheduleId: f.scheduleId, dueAt, takenAt: dueAt, quantity: 0.5 }
  await f.schedules({ operation: 'recordTaken', record: scheduled })
  const doseCorrection = {
    ...scheduled,
    quantity: 1.5,
    expectedRevision: 0,
    expectedOutcome: 'Taken',
    outcome: 'Taken',
    actionId: randomUUID(),
  }
  const doseReceipt = await f.schedules({ operation: 'correctOutcome', correction: doseCorrection })
  const strengthChange = await f.medicines({
    operation: 'changeStrength',
    change: {
      actionId: randomUUID(),
      medicineId: f.medicineId,
      expectedRevision: 0,
      strength: '400 mg',
      effectiveAt: dueAt,
      timeZone: 'Europe/Istanbul',
    },
  })
  const compatible = {
    actionId: randomUUID(),
    medicineId: f.medicineId,
    takenAt: date + 'T08:00:00.000Z',
    quantity: 1,
  }
  const unscheduledReceipt = await f.schedules({ operation: 'saveUnscheduled', dose: compatible })
  await f.medicines({
    operation: 'stockThreshold',
    stock: {
      actionId: randomUUID(),
      medicineId: f.medicineId,
      expectedRevision: 1,
      unit: 'tablet',
      threshold: 8,
    },
  })
  const before = await f.list()
  assert.equal(before.stock.count, 7.5)
  assert.equal(before.stock.low, true)
  const correction = await reviewedCorrection(f, 20)
  const [first, latest] = before.strengthRevisions
  const receipt = await f.medicines({
    operation: 'correctType',
    correction: {
      ...correction,
      details: { strengthRevisionId: first.id, label: 'Fixed', strength: '250 mg' },
    },
  })
  const saved = receipt.medicines[0]
  assert.deepEqual(saved.stock, { tracked: true, count: 20 })
  assert.equal(saved.lastActionId, correction.actionId)
  assert.deepEqual(
    saved.strengthRevisions.map(
      ({
        id,
        label,
        strength,
        unit,
      }: {
        id: string
        label: string
        strength: string
        unit: string
      }) => [id, label, strength, unit],
    ),
    [
      [first.id, 'Fixed', '250 mg', 'ovule'],
      [latest.id, 'Example', '400 mg', 'ovule'],
    ],
  )
  assert.deepEqual(saved.strengthRevisions[0].previousValues, [
    { label: 'Example', strength: '200 mg', unit: 'tablet' },
  ])
  const snapshot = await f.read()
  assert.deepEqual(snapshot.records[0], {
    ...doseReceipt.records[0],
    quantity: 2,
    recordedAt: date + 'T12:00:00.000Z',
    strength: '250 mg',
    medicineLabel: 'Fixed',
    unit: 'ovule',
  })
  assert.deepEqual(snapshot.unscheduledDoses[0], {
    ...unscheduledReceipt.unscheduledDoses[0],
    unit: 'ovule',
  })
  const history = await f.request('dose-history', { operation: 'read', medicineId: f.medicineId })
  assert.deepEqual(
    history.days[0].doses.map((dose: { quantity: number; unit: string }) => [
      dose.quantity,
      dose.unit,
    ]),
    [
      [1, 'ovule'],
      [2, 'ovule'],
    ],
  )
  assert.equal(snapshot.schedules[0].id, f.scheduleId)
  assert.deepEqual(snapshot.schedules[0].times, [{ time: '09:00', quantity: 2 }])
  assert.deepEqual((await f.saveSchedule()).schedules[0].times, [{ time: '09:00', quantity: 0.5 }])
  assert.deepEqual(
    await f.schedules({ operation: 'correctOutcome', correction: doseCorrection }),
    doseReceipt,
  )
  assert.deepEqual(
    await f.schedules({ operation: 'saveUnscheduled', dose: compatible }),
    unscheduledReceipt,
  )
  assert.equal(strengthChange.medicines[0].strength, '400 mg')

  f.setNow(date + 'T14:00:00.000Z')
  await f.schedules({
    operation: 'saveUnscheduled',
    dose: { ...compatible, actionId: randomUUID(), takenAt: date + 'T11:30:00.000Z' },
  })
  assert.equal((await f.list()).stock.count, 20)
  await f.schedules({
    operation: 'saveUnscheduled',
    dose: { ...compatible, actionId: randomUUID(), takenAt: date + 'T13:00:00.000Z' },
  })
  assert.equal((await f.list()).stock.count, 19)
  const movements = await f.db
    .prepare(
      'SELECT count_change,unit FROM intake_stock_movements WHERE owner_id=? ORDER BY unit DESC,dose_key,revision',
    )
    .bind(f.ownerId)
    .all()
  assert.deepEqual(movements.results, [
    { count_change: -0.5, unit: 'tablet' },
    { count_change: -1, unit: 'tablet' },
    { count_change: -1, unit: 'tablet' },
    { count_change: -1, unit: 'ovule' },
  ])
  const counts = await f.db
    .prepare('SELECT count,unit,kind FROM stock_movements WHERE owner_id=? ORDER BY occurred_at')
    .bind(f.ownerId)
    .all()
  assert.deepEqual(counts.results, [
    { count: 10, unit: 'tablet', kind: 'startingCount' },
    { count: 20, unit: 'ovule', kind: 'countCorrection' },
  ])
})

test('missing, invalid or unsolicited repairs and a missing fresh count leave the entire correction unapplied', async () => {
  const f = await fixture(10, 'ovule')
  const correction = await reviewedCorrection(f, 5)
  const before = { medicine: await f.list(), snapshot: await f.read() }
  const [repair] = correction.repairs
  for (const patch of [
    { repairs: [] },
    { repairs: [{ ...repair, quantity: 0.5 }] },
    { repairs: [{ ...repair, key: 'unscheduled:' + randomUUID() }] },
    { repairs: [repair, repair] },
    { stockCount: null },
  ]) {
    await assert.rejects(
      () => f.medicines({ operation: 'correctType', correction: { ...correction, ...patch } }),
      { status: 400 },
    )
  }
  assert.deepEqual({ medicine: await f.list(), snapshot: await f.read() }, before)
  const receipt = await f.medicines({ operation: 'correctType', correction })
  assert.equal(receipt.medicines[0].stock.count, 5)
})

test('a concurrent dose or Schedule version forces a fresh review even when the Medicine revision is unchanged', async () => {
  const f = await fixture(10)
  const first = await reviewedCorrection(f, 5)
  await f.schedules({
    operation: 'saveUnscheduled',
    dose: { actionId: randomUUID(), medicineId: f.medicineId, takenAt: earlier, quantity: 1 },
  })
  assert.equal((await f.list()).revision, first.expectedRevision)
  await assert.rejects(() => f.medicines({ operation: 'correctType', correction: first }), {
    status: 409,
  })
  const second = await reviewedCorrection(f, 5)
  await f.schedules({
    operation: 'edit',
    edit: {
      id: randomUUID(),
      basedOnId: f.scheduleId,
      times: [{ time: '10:00', quantity: 0.5 }],
      endDate: null,
    },
  })
  assert.equal((await f.list()).revision, second.expectedRevision)
  await assert.rejects(() => f.medicines({ operation: 'correctType', correction: second }), {
    status: 409,
  })
  assert.equal((await f.list()).unit, 'tablet')
  assert.equal((await f.list()).stock.count, 9)
  const correction = await reviewedCorrection(f, 5)
  // Land a real dose write after the command has validated the snapshot, but before its insert.
  const database = new Proxy(f.db, {
    get(target, property, receiver) {
      if (property !== 'prepare') return Reflect.get(target, property, receiver)
      return (query: string) => {
        const statement = target.prepare(query)
        if (!query.includes('INSERT INTO medicine_type_corrections')) return statement
        return {
          bind: (...params: unknown[]) => ({
            run: async () => {
              await f.schedules({
                operation: 'saveUnscheduled',
                dose: {
                  actionId: randomUUID(),
                  medicineId: f.medicineId,
                  takenAt: dueAt,
                  quantity: 1,
                },
              })
              return statement.bind(...params).run()
            },
          }),
        }
      }
    },
  })
  await assert.rejects(
    () =>
      f.request(
        'medicine-type-correction',
        { operation: 'correctType', correction },
        f.ownerId,
        database,
      ),
    { status: 409 },
  )
  assert.equal((await f.list()).revision, correction.expectedRevision)
  assert.equal((await f.list()).stock.count, 8)
  const fresh = await reviewedCorrection(f, 5)
  const result = await f.medicines({ operation: 'correctType', correction: fresh })
  assert.equal(result.medicines[0].unit, 'capsule')
})

test('the correction is owner-scoped and identical concurrent and lost-response retries replay once', async () => {
  const f = await fixture(10)
  const other = 'google:' + randomUUID()
  const correction = await reviewedCorrection(f, 5)
  await assert.rejects(
    () => f.medicines({ operation: 'reviewTypeCorrection', review: correction }, other),
    { status: 400 },
  )
  await assert.rejects(() => f.medicines({ operation: 'correctType', correction }, other), {
    status: 400,
  })
  const save = () => f.medicines({ operation: 'correctType', correction })
  const [receipt, replay] = await Promise.all([save(), save()])
  assert.deepEqual(replay, receipt)
  await f.medicines({
    operation: 'stockCorrection',
    stock: {
      actionId: randomUUID(),
      medicineId: f.medicineId,
      expectedRevision: 1,
      unit: 'capsule',
      count: 9,
    },
  })
  assert.deepEqual(await save(), receipt)
  await assert.rejects(
    () => f.medicines({ operation: 'correctType', correction: { ...correction, stockCount: 3 } }),
    { status: 409 },
  )
  assert.equal((await f.list()).stock.count, 9)
  const { results } = await f.db
    .prepare('SELECT count FROM stock_movements WHERE owner_id=? AND medicine_id=? AND id=?')
    .bind(f.ownerId, f.medicineId, correction.actionId)
    .all()
  assert.deepEqual(results, [{ count: 5 }])
})

test('migration keeps seeded histories and audit values, and rejects an older writer’s incompatible amount', async () => {
  const f = await fixture()
  const legacyList = async () =>
    (await f.medicines({ operation: 'list' }, legacy.ownerId)).medicines[0]
  const readLegacy = (day = date) =>
    f.request('schedules', { operation: 'listOutcomes', date: day }, legacy.ownerId)
  const before = await readLegacy()
  const beforeLater = await readLegacy('2026-11-06')
  assert.equal(before.records[0].quantity, legacy.quantity)
  assert.equal(beforeLater.records[0].revision, 1)
  const { results: seededMovements } = await f.db
    .prepare(
      'SELECT count_change,unit FROM intake_stock_movements WHERE owner_id=? AND medicine_id=?',
    )
    .bind(stockBackfill.ownerId, stockBackfill.medicineId)
    .all()
  assert.ok(
    seededMovements.some(
      (movement) => movement.count_change === -0.5 && movement.unit === 'tablet',
    ),
  )

  const reviewInput = { medicineId: legacy.medicineId, unit: 'capsule' }
  const { review } = await f.medicines(
    { operation: 'reviewTypeCorrection', review: reviewInput },
    legacy.ownerId,
  )
  const correction = {
    ...reviewInput,
    actionId: randomUUID(),
    expectedRevision: review.revision,
    reviewVersion: review.reviewVersion,
    stockCount: null,
    repairs: review.conflicts.map(({ key }: { key: string }) => ({ key, quantity: 2 })),
  }
  await f.medicines({ operation: 'correctType', correction }, legacy.ownerId)
  assert.deepEqual((await legacyList()).strengthRevisions[0].previousValues, [
    { label: 'Legacy dose', strength: null, unit: 'tablet' },
  ])
  assert.deepEqual((await readLegacy()).records[0], {
    ...before.records[0],
    quantity: 2,
    unit: 'capsule',
  })
  assert.deepEqual((await readLegacy('2026-11-06')).records[0], {
    ...beforeLater.records[0],
    unit: 'capsule',
  })
  assert.deepEqual((await readLegacy()).schedules, before.schedules)
  const raw = await f.db
    .prepare(
      'SELECT quantity,taken_at,unit FROM dose_records WHERE owner_id=? AND schedule_id=? AND due_at=?',
    )
    .bind(legacy.ownerId, legacy.scheduleId, dueAt)
    .first()
  assert.deepEqual(raw, { quantity: legacy.quantity, taken_at: legacy.takenAt, unit: 'tablet' })
  await assert.rejects(
    f.db
      .prepare(
        'INSERT INTO dose_records(owner_id,schedule_id,due_at,taken_at,quantity,outcome) VALUES(?,?,?,?,?,?)',
      )
      .bind(
        legacy.ownerId,
        legacy.scheduleId,
        '2026-11-07T06:00:00.000Z',
        '2026-11-07T06:00:00.000Z',
        0.5,
        'Taken',
      )
      .run(),
    /medicine_quantity_changed/,
  )
  await assert.rejects(
    f.db
      .prepare('UPDATE user_medications SET unit=? WHERE owner_id=? AND id=?')
      .bind('tablet', legacy.ownerId, legacy.medicineId)
      .run(),
    /medicine_unit_locked/,
  )
})
