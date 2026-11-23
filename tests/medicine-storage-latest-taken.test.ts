// Historical Taken lookup (#468): reads, receipts and the Strength change guard share one
// owner- and Medicine-scoped lookup, and stored receipts replay unchanged across 0035.
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, test } from 'vitest'
import { Miniflare, convertV4MiniflareOptions } from 'miniflare'
import { createWorker } from '../worker/index'
import { parseMedicineRecord } from '../src/features/medicines/contract'
import { applyD1Migrations } from './helpers/d1-migrations.mjs'
import { secret } from './helpers/medicine-storage-runtime'

let runtime: Miniflare
let db: D1Database
let now = new Date('2026-11-05T12:00:00.000Z')
const handler = createWorker(() => now)
const receiptTables = ['medicine_edits', 'medicine_stock_actions', 'medicine_archives']
const seeded = { ownerId: 'google:latest-taken-migration', commands: [] as object[] }
let seededResponses: unknown[] = []
let receiptsBefore: unknown[] = []
let receiptsAfter: unknown[] = []

async function request(path: string, command: object, ownerId: string) {
  const response = await handler.fetch(
    new Request(`http://worker/${path}`, {
      method: 'POST',
      headers: { authorization: `Bearer ${secret}` },
      body: JSON.stringify({ ...command, ownerId }),
    }),
    { DB: db, MEDICINES_WORKER_SECRET: secret },
  )
  const body = await response.json()
  if (!response.ok) throw new Error(`${response.status}: ${JSON.stringify(body)}`)
  return body as Record<string, unknown>
}

const receipts = () =>
  Promise.all(
    receiptTables.map(
      async (table) =>
        (
          await db
            .prepare(`SELECT * FROM ${table} WHERE owner_id=? ORDER BY action_id`)
            .bind(seeded.ownerId)
            .all()
        ).results,
    ),
  )

// Medicine action receipts stored by the Worker against the schema before 0035.
async function seedReceipts() {
  const medicine = { id: randomUUID(), label: 'Example', strength: '200 mg', unit: 'tablet' }
  await request('medicines', { operation: 'save', medicine }, seeded.ownerId)
  await request(
    'schedules',
    {
      operation: 'saveUnscheduled',
      dose: {
        actionId: randomUUID(),
        medicineId: medicine.id,
        takenAt: '2026-11-05T07:00:00.000Z',
        quantity: 1,
      },
    },
    seeded.ownerId,
  )
  const key = (expectedRevision: number) => ({
    actionId: randomUUID(),
    medicineId: medicine.id,
    expectedRevision,
  })
  seeded.commands = [
    {
      operation: 'changeStrength',
      change: {
        ...key(0),
        strength: '400 mg',
        effectiveAt: '2026-11-05T08:00:00.000Z',
        timeZone: 'Europe/Istanbul',
      },
    },
    { operation: 'stockOn', stock: { ...key(1), unit: 'tablet', startingCount: 20 } },
    { operation: 'archive', archive: key(2) },
  ]
  seededResponses = []
  for (const command of seeded.commands)
    seededResponses.push(await request('medicines', command, seeded.ownerId))
}

beforeAll(async () => {
  runtime = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: 'export default { fetch() { return new Response("latest taken test") } }',
      compatibilityDate: '2026-11-03',
      d1Databases: ['DB'],
    }),
  )
  db = (await runtime.getD1Database('DB')) as unknown as D1Database
  let previous = ''
  await applyD1Migrations(db, {
    async afterMigration(file) {
      if (file === '0035_scoped_latest_taken.sql') {
        assert.ok(previous, 'a migration runs before 0035')
        receiptsAfter = await receipts()
      }
      previous = file
      if (file === '0034_refill_push_activation.sql') {
        await seedReceipts()
        receiptsBefore = await receipts()
      }
    },
  })
})
afterAll(async () => {
  await runtime?.dispose()
})

test('a Medicine action receipt stored before 0035 replays exactly after it', async () => {
  assert.equal(seededResponses.length, 3)
  for (const rows of receiptsBefore) assert.equal((rows as unknown[]).length, 1)
  assert.deepEqual(receiptsAfter, receiptsBefore)
  const stored = parseMedicineRecord((seededResponses[0] as { medicines: unknown[] }).medicines[0])
  assert.equal(stored.latestTakenAt, '2026-11-05T07:00:00.000Z')
  for (const [i, command] of seeded.commands.entries())
    assert.deepEqual(await request('medicines', command, seeded.ownerId), seededResponses[i])
  assert.deepEqual(await receipts(), receiptsBefore)
})

async function owner() {
  const ownerId = `google:${randomUUID()}`
  const send = (path: string, command: object) => request(path, command, ownerId)
  const save = async () => {
    const medicine = { id: randomUUID(), label: 'Example', strength: '200 mg', unit: 'tablet' }
    await send('medicines', { operation: 'save', medicine })
    return medicine.id
  }
  const latest = async (medicineId: string) => {
    const { medicines } = await send('medicines', { operation: 'list' })
    return (medicines as unknown[]).map(parseMedicineRecord).find((m) => m.id === medicineId)!
      .latestTakenAt
  }
  const schedule = async (medicineId: string) => {
    now = new Date('2026-11-05T03:00:00.000Z')
    const id = randomUUID()
    await send('schedules', {
      operation: 'save',
      schedule: {
        id,
        medicineId,
        startDate: '2026-11-05',
        times: [{ time: '09:00', quantity: 1 }],
      },
    })
    now = new Date('2026-11-05T12:00:00.000Z')
    return id
  }
  return { ownerId, send, save, latest, schedule }
}

test('reads, receipts and the Strength change guard agree on the historical Taken maximum', async () => {
  const o = await owner()
  const medicineId = await o.save()
  const other = await o.save()
  await o.send('schedules', {
    operation: 'saveUnscheduled',
    dose: {
      actionId: randomUUID(),
      medicineId: other,
      takenAt: '2026-11-05T11:00:00.000Z',
      quantity: 1,
    },
  })

  // A removed Unscheduled dose keeps its Taken instant.
  const saved = await o.send('schedules', {
    operation: 'saveUnscheduled',
    dose: { actionId: randomUUID(), medicineId, takenAt: '2026-11-05T06:30:00.000Z', quantity: 1 },
  })
  const dose = (saved.unscheduledDoses as Record<string, unknown>[])[0]
  await o.send('schedules', {
    operation: 'changeUnscheduled',
    change: { actionId: randomUUID(), doseId: dose.id, expectedRevision: 0, removed: true },
  })
  assert.equal(await o.latest(medicineId), '2026-11-05T06:30:00.000Z')

  // The original scheduled outcome outlives a correction to an earlier time.
  const scheduleId = await o.schedule(medicineId)
  const dueAt = '2026-11-05T06:00:00.000Z'
  await o.send('schedules', {
    operation: 'recordTaken',
    record: { scheduleId, dueAt, takenAt: '2026-11-05T08:00:00.000Z', quantity: 1 },
  })
  const correct = (expectedRevision: number, takenAt: string) =>
    o.send('schedules', {
      operation: 'correctOutcome',
      correction: {
        actionId: randomUUID(),
        scheduleId,
        dueAt,
        expectedRevision,
        expectedOutcome: 'Taken',
        outcome: 'Taken',
        takenAt,
        quantity: 1,
      },
    })
  await correct(0, '2026-11-05T06:05:00.000Z')
  assert.equal(await o.latest(medicineId), '2026-11-05T08:00:00.000Z')

  // An earlier correction outlives a later correction back to an earlier time.
  await correct(1, '2026-11-05T09:00:00.000Z')
  await correct(2, '2026-11-05T06:05:00.000Z')
  const historical = '2026-11-05T09:00:00.000Z'
  assert.equal(await o.latest(medicineId), historical)

  const stock = await o.send('medicines', {
    operation: 'stockOn',
    stock: {
      actionId: randomUUID(),
      medicineId,
      expectedRevision: 0,
      unit: 'tablet',
      startingCount: 20,
    },
  })
  const stockReceipt = parseMedicineRecord((stock.medicines as unknown[])[0])
  assert.equal(stockReceipt.latestTakenAt, historical)

  const change = {
    actionId: randomUUID(),
    medicineId,
    expectedRevision: 1,
    strength: '400 mg',
    effectiveAt: '2026-11-05T08:59:59.999Z',
    timeZone: 'Europe/Istanbul',
  }
  await assert.rejects(() => o.send('medicines', { operation: 'changeStrength', change }), /400/)
  const changed = await o.send('medicines', {
    operation: 'changeStrength',
    change: { ...change, actionId: randomUUID(), effectiveAt: historical },
  })
  const strengthReceipt = parseMedicineRecord((changed.medicines as unknown[])[0])
  assert.equal(strengthReceipt.revision, 2)
  assert.equal(strengthReceipt.latestTakenAt, historical)
  assert.equal(await o.latest(medicineId), historical)
  assert.equal(await o.latest(other), '2026-11-05T11:00:00.000Z')
})

test('the lookup searches only its owner and Medicine as unrelated history grows', async () => {
  const o = await owner()
  const [first, second, unrelated] = [await o.save(), await o.save(), await o.save()]
  const stranger = await owner()
  const strangerMedicine = await stranger.save()
  for (const medicineId of [first, second])
    await o.send('schedules', {
      operation: 'saveUnscheduled',
      dose: {
        actionId: randomUUID(),
        medicineId,
        takenAt: '2026-11-05T07:00:00.000Z',
        quantity: 1,
      },
    })

  const read = 'SELECT record FROM medicine_records WHERE owner_id=? AND id=?'
  const readRows = async (medicineId: string) =>
    (await db.prepare(read).bind(o.ownerId, medicineId).run()).meta.rows_read
  // A raw changeStrength insert runs the guard, apply and receipt triggers in one statement.
  const strengthChangeRows = async (medicineId: string) => {
    const { meta } = await db
      .prepare(
        `INSERT INTO medicine_edits(owner_id,action_id,medicine_id,expected_revision,kind,
         strength_revision_id,strength,label,unit,effective_at,confirmed_at,request)
         VALUES(?,?,?,0,'changeStrength',?,'400 mg','Example','tablet',
         '2026-11-05T08:00:00.000Z','2026-11-05T12:00:00.000Z','{}')`,
      )
      .bind(o.ownerId, randomUUID(), medicineId, randomUUID())
      .run()
    assert.ok(meta.changes > 0, 'the Strength change applies')
    return meta.rows_read
  }
  const unscheduled = (ownerId: string, medicineId: string, count: number) =>
    db.batch(
      Array.from({ length: count }, (_, i) =>
        db
          .prepare(
            `INSERT INTO unscheduled_doses(owner_id,id,revision,action_id,medicine_id,taken_at,quantity,request)
             VALUES(?,?,0,?,?,?,1,'{}')`,
          )
          .bind(
            ownerId,
            randomUUID(),
            randomUUID(),
            medicineId,
            `2026-11-04T${String(i % 24).padStart(2, '0')}:00:00.000Z`,
          ),
      ),
    )
  const scheduled = async (h: Awaited<ReturnType<typeof owner>>, medicineId: string) => {
    const scheduleId = await h.schedule(medicineId)
    const dueAt = '2026-11-05T06:00:00.000Z'
    await h.send('schedules', {
      operation: 'recordTaken',
      record: { scheduleId, dueAt, takenAt: '2026-11-05T06:00:00.000Z', quantity: 1 },
    })
    await h.send('schedules', {
      operation: 'correctOutcome',
      correction: {
        actionId: randomUUID(),
        scheduleId,
        dueAt,
        expectedRevision: 0,
        expectedOutcome: 'Taken',
        outcome: 'Taken',
        takenAt: '2026-11-05T06:10:00.000Z',
        quantity: 1,
      },
    })
  }

  const change = await strengthChangeRows(first)
  // lastActionId still reads every receipt row (outside this lookup), so drop the extra one.
  await db
    .prepare('DELETE FROM medicine_edits WHERE owner_id=? AND medicine_id=?')
    .bind(o.ownerId, first)
    .run()
  const baseline = await readRows(second)
  for (const [round, size] of [40, 80].entries()) {
    if (round === 0) {
      await scheduled(o, unrelated)
      await scheduled(stranger, strangerMedicine)
    }
    await unscheduled(o.ownerId, unrelated, size)
    await unscheduled(stranger.ownerId, strangerMedicine, size)
    assert.equal(await readRows(second), baseline, `read rows after round ${round + 1}`)
  }
  assert.equal(await strengthChangeRows(second), change, 'Strength change rows')

  const { results } = await db
    .prepare(`EXPLAIN QUERY PLAN ${read}`)
    .bind(o.ownerId, second)
    .all<{ detail: string }>()
  const plan = results.map((row) => row.detail).join('\n')
  for (const history of [
    'daily_schedules',
    'dose_records',
    'dose_corrections',
    'unscheduled_doses',
  ])
    assert.doesNotMatch(plan, new RegExp(`SCAN ${history}\\b`), plan)
  assert.match(
    plan,
    /SEARCH s USING (COVERING )?INDEX daily_schedules_owner_medicine \(owner_id=\? AND medicine_id=\?\)/,
    plan,
  )
  assert.match(
    plan,
    /SEARCH d USING INDEX sqlite_autoindex_dose_records_1 \(owner_id=\? AND schedule_id=\?\)/,
    plan,
  )
  assert.match(
    plan,
    /SEARCH d USING INDEX sqlite_autoindex_dose_corrections_1 \(owner_id=\? AND schedule_id=\?\)/,
    plan,
  )
  assert.match(
    plan,
    /SEARCH u USING COVERING INDEX unscheduled_doses_owner_medicine_taken \(owner_id=\? AND medicine_id=\?\)/,
    plan,
  )
})
