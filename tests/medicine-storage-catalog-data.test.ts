import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { Miniflare, convertV4MiniflareOptions } from 'miniflare'
import { beforeAll, test, vi } from 'vitest'
import { createWorker } from '../worker/index'
import { GET } from '../src/app/api/catalog-products/route'
import { catalogMatch, type CatalogStatus } from '../src/features/catalog-products/contract'
import { catalogCsv, parseCatalog } from '../scripts/catalog-migration.mjs'
import {
  applyD1Migration,
  applyD1Migrations,
  catalogDataMigration,
  d1MigrationFiles,
} from './helpers/d1-migrations.mjs'
import { startWorkerRuntime, runtime, secret } from './helpers/medicine-storage-runtime'
import { installSyntheticWorker } from './helpers/synthetic-worker'

// The real catalog data migration on real D1 (#472). Only this file opts in to catalog data;
// every other suite migrates without it.
vi.mock('server-only', () => ({}))
vi.mock('@/features/auth/server', () => ({ requireUser: async () => ({ id: 'google:catalog' }) }))
startWorkerRuntime({ catalogData: true })
installSyntheticWorker()

const csv = readFileSync(catalogCsv, 'utf8')
const { rows, errors } = parseCatalog(csv)
const latest = async () =>
  (await d1MigrationFiles({ catalogData: true }))
    .filter((file) => catalogDataMigration.test(file))
    .at(-1)!

beforeAll(async () => {
  const db = await runtime.getD1Database('DB')
  process.env.MEDICINES_WORKER_SECRET = secret
  const worker = createWorker()
  globalThis.fetch = async (url, init) =>
    worker.fetch(
      new Request(url as URL, { method: init!.method, headers: init!.headers, body: init!.body }),
      { DB: db, MEDICINES_WORKER_SECRET: secret },
    )
})

test('applying the data migration twice leaves exactly the committed CSV, one row per GTIN', async () => {
  assert.deepEqual(errors, [])
  const db = await runtime.getD1Database('DB')
  await applyD1Migration(db, await latest())
  const count = await db
    .prepare('SELECT count(*) AS rows, count(DISTINCT gtin) AS gtins FROM catalog_products')
    .first()
  assert.deepEqual(count, { rows: rows.length, gtins: rows.length })
  const { results } = await db
    .prepare(
      'SELECT gtin, original_name, name, strength, type, status FROM catalog_products ORDER BY gtin',
    )
    .all()
  const sorted = [...rows].sort((a, b) => (a.gtin < b.gtin ? -1 : 1))
  assert.deepEqual(results, sorted, 'every column is stored unchanged')
})

test('a real 13-digit, 12-digit and 14-digit pack barcode resolve through the lookup', async () => {
  const barcodes = csv
    .split('\n')
    .slice(1)
    .map((line) => line.split(',')[0]!)
  for (const length of [13, 12, 14]) {
    const barcode = barcodes.find((value) => value.length === length)
    assert.ok(barcode, `the catalog holds a ${length}-digit barcode`)
    const row = rows.find((candidate) => candidate.gtin === barcode.padStart(14, '0'))!
    const response = await GET(
      new Request(`http://app.test/api/catalog-products?barcode=${barcode}`),
    )
    assert.deepEqual(
      { status: response.status, body: await response.json() },
      { status: 200, body: catalogMatch({ ...row, status: row.status as CatalogStatus }) },
      `${length}-digit ${barcode}`,
    )
  }
})

test('every other test database is migrated without catalog data', async () => {
  const data = await latest()
  assert.ok(!(await d1MigrationFiles()).includes(data), 'the default chain skips data migrations')
  const plain = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: 'export default { fetch: () => new Response() }',
      d1Databases: ['DB'],
    }),
  )
  try {
    const db = await plain.getD1Database('DB')
    const applied: string[] = []
    await applyD1Migrations(db, { afterMigration: (file) => applied.push(file) })
    assert.ok(!applied.some((file) => catalogDataMigration.test(file)))
    assert.deepEqual(await db.prepare('SELECT count(*) AS rows FROM catalog_products').first(), {
      rows: 0,
    })
  } finally {
    await plain.dispose()
  }
})
