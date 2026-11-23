// Medicine lastActionId lookup (#470): reads and receipts take the highest-revision action
// across the five receipt kinds from the owner's own Medicine only, and stored receipts
// replay unchanged across 0036.
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, test } from 'vitest'
import { Miniflare, convertV4MiniflareOptions } from 'miniflare'
import { createWorker } from '../worker/index'
import { parseMedicineRecord } from '../src/features/medicines/contract'
import { parseTypeCorrectionReview } from '../src/features/medicines/type-correction-contract'
import { applyD1Migrations } from './helpers/d1-migrations.mjs'
import { secret } from './helpers/medicine-storage-runtime'

let runtime: Miniflare
let db: D1Database
const handler = createWorker(() => new Date('2026-11-05T12:00:00.000Z'))
const receiptTables = [
  'medicine_edits',
  'medicine_archives',
  'medicine_restores',
  'medicine_stock_actions',
  'medicine_type_corrections',
]
const seededOwner = 'google:last-action-migration'
let seeded: Action[] = []
let receiptsBefore: unknown[] = []
let receiptsAfter: unknown[] = []

type Action = { path: string; command: object; actionId: string; response: unknown }

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

const receipts = (ownerId: string) =>
  Promise.all(
    receiptTables.map(
      async (table) =>
        (
          await db
            .prepare(`SELECT * FROM ${table} WHERE owner_id=? ORDER BY action_id`)
            .bind(ownerId)
            .all()
        ).results,
    ),
  )

async function save(ownerId: string) {
  const medicine = { id: randomUUID(), label: 'Example', strength: '200 mg', unit: 'tablet' }
  const saved = await request('medicines', { operation: 'save', medicine }, ownerId)
  return parseMedicineRecord((saved.medicines as unknown[])[0])
}

async function list(ownerId: string, medicineId: string) {
  const { medicines } = await request('medicines', { operation: 'list' }, ownerId)
  return (medicines as unknown[]).map(parseMedicineRecord).find((m) => m.id === medicineId)!
}

// One edit, archive, restore, stock action and Type correction, in revision order.
async function fiveKinds(ownerId: string, medicineId: string, afterEach?: (a: Action) => unknown) {
  const record = await list(ownerId, medicineId)
  const key = (expectedRevision: number) => ({
    actionId: randomUUID(),
    medicineId,
    expectedRevision: record.revision + expectedRevision,
  })
  const steps: [string, () => Promise<object>][] = [
    [
      'medicines',
      async () => ({
        operation: 'correctDetails',
        correction: {
          ...key(0),
          strengthRevisionId: record.currentStrengthRevisionId,
          label: 'Corrected',
          strength: '250 mg',
          unit: record.unit,
        },
      }),
    ],
    ['medicines', async () => ({ operation: 'archive', archive: key(1) })],
    ['medicines', async () => ({ operation: 'restore', restore: key(2) })],
    [
      'medicines',
      async () => ({
        operation: 'stockOn',
        stock: { ...key(3), unit: record.unit, startingCount: 20 },
      }),
    ],
    [
      'medicine-type-correction',
      async () => {
        const unit = record.unit === 'tablet' ? 'capsule' : 'tablet'
        const { review } = await request(
          'medicine-type-correction',
          { operation: 'reviewTypeCorrection', review: { medicineId, unit } },
          ownerId,
        )
        const parsed = parseTypeCorrectionReview(review)
        return {
          operation: 'correctType',
          correction: {
            ...key(4),
            unit,
            reviewVersion: parsed.reviewVersion,
            repairs: [],
            stockCount: 20,
          },
        }
      },
    ],
  ]
  const actions: Action[] = []
  for (const [path, build] of steps) {
    const command = await build()
    const { actionId } = Object.values(command).find((v) => typeof v === 'object') as {
      actionId: string
    }
    const action = { path, command, actionId, response: await request(path, command, ownerId) }
    actions.push(action)
    await afterEach?.(action)
  }
  return actions
}

beforeAll(async () => {
  runtime = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: 'export default { fetch() { return new Response("last action test") } }',
      compatibilityDate: '2026-11-03',
      d1Databases: ['DB'],
    }),
  )
  db = (await runtime.getD1Database('DB')) as unknown as D1Database
  await applyD1Migrations(db, {
    async afterMigration(file) {
      if (file === '0035_scoped_latest_taken.sql') {
        // Medicine action receipts stored by the Worker against the schema before 0036.
        seeded = await fiveKinds(seededOwner, (await save(seededOwner)).id)
        receiptsBefore = await receipts(seededOwner)
      }
      if (file === '0036_scoped_last_action.sql') receiptsAfter = await receipts(seededOwner)
    },
  })
})
afterAll(async () => {
  await runtime?.dispose()
})

test('Medicine action receipts stored before 0036 replay exactly after it', async () => {
  assert.equal(seeded.length, 5)
  for (const rows of receiptsBefore) assert.equal((rows as unknown[]).length, 1)
  assert.deepEqual(receiptsAfter, receiptsBefore)
  for (const { path, command, response } of seeded)
    assert.deepEqual(await request(path, command, seededOwner), response)
  assert.deepEqual(await receipts(seededOwner), receiptsBefore)
})

test('reads and receipts return the highest-revision action across all five receipt kinds', async () => {
  const ownerId = `google:${randomUUID()}`
  const medicine = await save(ownerId)
  const other = await save(ownerId)
  assert.equal(medicine.lastActionId, null)
  let revision = medicine.revision
  await fiveKinds(ownerId, medicine.id, async ({ actionId, response }) => {
    const receipt = parseMedicineRecord((response as { medicines: unknown[] }).medicines[0])
    assert.equal(receipt.revision, ++revision)
    assert.equal(receipt.lastActionId, actionId)
    const read = await list(ownerId, medicine.id)
    assert.equal(read.revision, revision)
    assert.equal(read.lastActionId, actionId)
  })
  assert.equal((await list(ownerId, other.id)).lastActionId, null)
})

test('the lookup searches only its owner and Medicine as unrelated receipts grow', async () => {
  const ownerId = `google:${randomUUID()}`
  const [reader, second, third, unrelated] = [
    await save(ownerId),
    await save(ownerId),
    await save(ownerId),
    await save(ownerId),
  ]
  const stranger = `google:${randomUUID()}`
  const strangerMedicine = await save(stranger)

  const read = 'SELECT record FROM medicine_records WHERE owner_id=? AND id=?'
  const readRows = async () =>
    (await db.prepare(read).bind(ownerId, reader.id).run()).meta.rows_read
  // A raw archive insert runs the guard, apply and receipt triggers in one statement.
  const archiveRows = async (medicineId: string) => {
    const { meta } = await db
      .prepare(
        `INSERT INTO medicine_archives(owner_id,action_id,medicine_id,expected_revision,confirmed_at,request)
         VALUES(?,?,?,0,'2026-11-05T12:00:00.000Z','{}')`,
      )
      .bind(ownerId, randomUUID(), medicineId)
      .run()
    assert.ok(meta.changes > 0, 'the archive applies')
    return meta.rows_read
  }
  // Each cycle adds an edit, archive and restore receipt.
  const grow = async (owner: string, medicineId: string, cycles: number) => {
    for (let i = 0; i < cycles; i++) {
      const { revision, currentStrengthRevisionId, unit } = await list(owner, medicineId)
      const key = (offset: number) => ({
        actionId: randomUUID(),
        medicineId,
        expectedRevision: revision + offset,
      })
      await request(
        'medicines',
        {
          operation: 'correctDetails',
          correction: {
            ...key(0),
            strengthRevisionId: currentStrengthRevisionId,
            label: `Example ${i}`,
            strength: '200 mg',
            unit,
          },
        },
        owner,
      )
      await request('medicines', { operation: 'archive', archive: key(1) }, owner)
      await request('medicines', { operation: 'restore', restore: key(2) }, owner)
    }
  }

  const archive = await archiveRows(second.id)
  const baseline = await readRows()
  for (const [round, cycles] of [5, 10].entries()) {
    if (round === 0) {
      await fiveKinds(ownerId, unrelated.id)
      await fiveKinds(stranger, strangerMedicine.id)
    }
    await grow(ownerId, unrelated.id, cycles)
    await grow(stranger, strangerMedicine.id, cycles)
    assert.equal(await readRows(), baseline, `read rows after round ${round + 1}`)
  }
  assert.equal(await archiveRows(third.id), archive, 'archive receipt rows')

  const { results } = await db
    .prepare(`EXPLAIN QUERY PLAN ${read}`)
    .bind(ownerId, reader.id)
    .all<{ detail: string }>()
  const plan = results.map((row) => row.detail).join('\n')
  for (const table of receiptTables) {
    assert.doesNotMatch(plan, new RegExp(`SCAN ${table}\\b`), plan)
    assert.match(
      plan,
      new RegExp(
        `SEARCH ${table} USING INDEX sqlite_autoindex_${table}_2 \\(owner_id=\\? AND medicine_id=\\?\\)`,
      ),
      plan,
    )
  }
})
