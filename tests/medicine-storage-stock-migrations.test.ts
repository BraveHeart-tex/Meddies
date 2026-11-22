import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'vitest'
import { Miniflare, convertV4MiniflareOptions } from 'miniflare'
import { applyD1Migrations } from './helpers/d1-migrations.mjs'

test('migrations after 0028 preserve Stock movements, action receipts, intake movements and counts', async () => {
  const runtime = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: 'export default { fetch() { return new Response("migration test") } }',
      compatibilityDate: '2026-11-03',
      d1Databases: ['DB'],
    }),
  )
  try {
    const db = await runtime.getD1Database('DB')
    const ownerId = 'google:stock-migration'
    const medicineId = randomUUID()
    const stockTables = ['stock_movements', 'medicine_stock_actions', 'intake_stock_movements']
    const rowCounts = async () =>
      Promise.all(
        stockTables.map((table) =>
          db
            .prepare(`SELECT COUNT(*) FROM ${table} WHERE owner_id=?`)
            .bind(ownerId)
            .first<number>('COUNT(*)'),
        ),
      )
    let seeded = false
    let checked = 0
    let receipts: unknown
    await applyD1Migrations(db, {
      async afterMigration(file) {
        if (file === '0028_refill.sql') {
          // Use the schema at 0028, independent of future Worker request changes.
          // Real insertion triggers create the movements, receipt and resulting count.
          await db.batch([
            db
              .prepare('INSERT INTO user_medications(owner_id,id,label,unit) VALUES(?,?,?,?)')
              .bind(ownerId, medicineId, 'Migration fixture', 'tablet'),
            db
              .prepare(
                `INSERT INTO medicine_stock_actions
                 (owner_id,action_id,medicine_id,expected_revision,kind,count,unit,confirmed_at,request)
                 VALUES(?,?,?,0,'stockOn',12.5,'tablet','2026-11-21T09:00:00.000Z',?)`,
              )
              .bind(ownerId, randomUUID(), medicineId, '{"startingCount":12.5}'),
            db
              .prepare(
                `INSERT INTO unscheduled_doses
                 (owner_id,id,revision,action_id,medicine_id,taken_at,quantity,request)
                 VALUES(?,?,0,?,?,'2026-11-21T10:00:00.000Z',2,?)`,
              )
              .bind(ownerId, randomUUID(), randomUUID(), medicineId, '{"quantity":2}'),
          ])
          const seededReceipts = (
            await db
              .prepare(
                'SELECT action_id,request,result FROM medicine_stock_actions WHERE owner_id=?',
              )
              .bind(ownerId)
              .all()
          ).results
          assert.equal(seededReceipts.length, 1)
          assert.ok(seededReceipts[0].result)
          receipts = seededReceipts
          seeded = true
        }
        if (file === '0031_medicine_type_correction.sql') {
          await db.batch([
            db
              .prepare(
                'UPDATE user_medications SET low_stock_threshold=11 WHERE owner_id=? AND id=?',
              )
              .bind(ownerId, medicineId),
            db
              .prepare(
                `INSERT INTO user_medications
              (owner_id,id,label,unit,stock_count,low_stock_threshold,archived_at) VALUES
              (?,?,'Equal','tablet',5,5,NULL),
              (?,?,'Untracked','tablet',NULL,5,NULL),
              (?,?,'Archived','tablet',4,5,'2026-11-21T10:00:00.000Z')`,
              )
              .bind(ownerId, randomUUID(), ownerId, randomUUID(), ownerId, randomUUID()),
          ])
        }
        if (file === '0032_low_stock_episodes.sql') {
          const { results } = await db
            .prepare(
              'SELECT medicine_id AS medicineId, id, push_eligible AS pushEligible FROM low_stock_episodes WHERE owner_id=?',
            )
            .bind(ownerId)
            .all<{ medicineId: string; id: string; pushEligible: number }>()
          assert.equal(results.length, 1)
          assert.equal(results[0].medicineId, medicineId)
          assert.ok(results[0].id)
          assert.equal(results[0].pushEligible, 0)
          const record = await db
            .prepare('SELECT record FROM medicine_records WHERE owner_id=? AND id=?')
            .bind(ownerId, medicineId)
            .first<string>('record')
          assert.ok(record)
          assert.deepEqual(JSON.parse(record).stock, {
            tracked: true,
            count: 10.5,
            intakePastCount: false,
            threshold: 11,
            low: true,
          })
        }
        if (!seeded) return
        // Assert at every boundary: a later migration must not hide earlier data loss.
        assert.deepEqual(await rowCounts(), [1, 1, 1], `${file}: stock row counts`)
        assert.equal(
          await db
            .prepare('SELECT stock_count FROM user_medications WHERE owner_id=? AND id=?')
            .bind(ownerId, medicineId)
            .first<number>('stock_count'),
          10.5,
          `${file}: stored Stock count`,
        )
        assert.deepEqual(
          (
            await db
              .prepare(
                'SELECT action_id,request,result FROM medicine_stock_actions WHERE owner_id=?',
              )
              .bind(ownerId)
              .all()
          ).results,
          receipts,
          `${file}: immutable stock action receipt`,
        )
        assert.deepEqual(
          (await db.prepare('PRAGMA foreign_key_check').all()).results,
          [],
          `${file}: foreign keys`,
        )
        if (file !== '0028_refill.sql') checked++
      },
    })
    assert.ok(seeded, 'stock fixture migration must run')
    assert.ok(checked > 0, 'at least one later migration must run')
  } finally {
    await runtime.dispose()
  }
})
