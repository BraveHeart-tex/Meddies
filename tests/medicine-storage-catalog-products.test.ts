import assert from 'node:assert/strict'
import { beforeAll, test, vi } from 'vitest'
import { createWorker } from '../worker/index'
import { GET } from '../src/app/api/catalog-products/route'
import { startWorkerRuntime, runtime, secret } from './helpers/medicine-storage-runtime'
import { installSyntheticWorker } from './helpers/synthetic-worker'

// Catalog product lookup on real D1, through the API route, server wiring and Worker (#196).
vi.mock('server-only', () => ({}))
vi.mock('@/features/auth/server', () => ({ requireUser: async () => ({ id: 'google:catalog' }) }))
startWorkerRuntime()
installSyntheticWorker()

const long = (length: number) => 'X'.repeat(length)
// [gtin, original_name, name, strength, type, status]
const fixtures = [
  [
    '08699809018853',
    'WARFMADIN 5 MG TABLET (28 TABLET)',
    'WARFMADIN',
    '5 mg',
    'tablet',
    'classified',
  ],
  ['00036000291452', 'DEMO CAPSULE', 'DEMO', '10 mg', 'capsule', 'classified'],
  ['08699809018884', 'SINORETIK 30 TABLET', 'SINORETIK', '20 mg/12.5 mg', 'tablet', 'classified'],
  ['08699546090013', 'BELIRSIZ 100 MG', 'BELIRSIZ', '100 mg', null, 'unresolved'],
  [
    '08699546090020',
    'ASIST C TOZ ICEREN 20 SASE',
    'ASIST C',
    '600 mg/300 mg',
    'tablet',
    'unsupported',
  ],
  ['08699546090037', 'UZUN', 'UZUN', long(121), 'tablet', 'classified'],
  ['08699546090044', 'UZUN AD', long(121), '5 mg', 'liquid', 'classified'],
  ['08699546090051', 'ENJEKTABL', 'ENJEKTABL', '', 'injection', 'classified'],
  ['08699546090068', 'BOS', '   ', null, 'drops', 'classified'],
  ['08699546090075', 'SINIR', long(120), ` ${long(120)} `, 'inhaler', 'classified'],
] as const

beforeAll(async () => {
  const db = await runtime.getD1Database('DB')
  process.env.MEDICINES_WORKER_SECRET = secret
  await db.batch(
    fixtures.map((row) =>
      db
        .prepare(
          'INSERT INTO catalog_products (gtin, original_name, name, strength, type, status) VALUES (?, ?, ?, ?, ?, ?)',
        )
        .bind(...row),
    ),
  )
  const worker = createWorker()
  globalThis.fetch = async (url, init) =>
    worker.fetch(
      new Request(url as URL, { method: init!.method, headers: init!.headers, body: init!.body }),
      { DB: db, MEDICINES_WORKER_SECRET: secret },
    )
})

const lookup = async (barcode: string) => {
  const response = await GET(
    new Request(`http://app.test/api/catalog-products?barcode=${encodeURIComponent(barcode)}`),
  )
  return { status: response.status, body: await response.json() }
}
const match = (
  name: string | null,
  strength: string | null,
  type: string | null,
  supportedForm = true,
) => ({
  status: 200,
  body: { outcome: 'match', name, strength, type, supportedForm },
})

test('an EAN-13, a UPC-A and a DataMatrix GTIN-14 return the stored name, strength and type', async () => {
  const warfmadin = match('WARFMADIN', '5 mg', 'tablet')
  assert.deepEqual(await lookup('8699809018853'), warfmadin, 'EAN-13')
  assert.deepEqual(await lookup('08699809018853'), warfmadin, 'the same pack’s DataMatrix GTIN-14')
  assert.deepEqual(await lookup('036000291452'), match('DEMO', '10 mg', 'capsule'), 'UPC-A')
  assert.deepEqual(
    await lookup('08699809018884'),
    match('SINORETIK', '20 mg/12.5 mg', 'tablet'),
    'DataMatrix GTIN-14',
  )
})

test('unresolved and unsupported rows, and values Add medicine would reject, return nulls', async () => {
  assert.deepEqual(await lookup('8699546090013'), match('BELIRSIZ', '100 mg', null), 'unresolved')
  assert.deepEqual(
    await lookup('8699546090020'),
    match('ASIST C', '600 mg/300 mg', null, false),
    'unsupported drops its stored type',
  )
  assert.deepEqual(
    await lookup('8699546090037'),
    match('UZUN', null, 'tablet'),
    'strength over 120',
  )
  assert.deepEqual(await lookup('8699546090044'), match(null, '5 mg', 'liquid'), 'name over 120')
  assert.deepEqual(
    await lookup('8699546090051'),
    match('ENJEKTABL', null, null),
    'empty strength and a Type Add medicine has no option for',
  )
  assert.deepEqual(await lookup('8699546090068'), match(null, null, 'drops'), 'blank name')
  assert.deepEqual(
    await lookup('8699546090075'),
    match(long(120), ` ${long(120)} `, 'inhaler'),
    'values at the limit return exactly as stored',
  )
})

test('an unknown or bad-check-digit barcode returns noMatch', async () => {
  assert.deepEqual(await lookup('8699546090082'), { status: 200, body: { outcome: 'noMatch' } })
  assert.deepEqual(await lookup('8699809018854'), { status: 200, body: { outcome: 'noMatch' } })
})

test('the schema keys catalog products by a 14-digit GTIN with a known status', async () => {
  const db = await runtime.getD1Database('DB')
  const insert = (gtin: string, status: string) =>
    db
      .prepare("INSERT INTO catalog_products (gtin, original_name, status) VALUES (?, 'X', ?)")
      .bind(gtin, status)
      .run()
  await assert.rejects(insert('8699546090099', 'classified'), /CHECK/, '13 digits')
  await assert.rejects(insert('0869954609009a', 'classified'), /CHECK/, 'non-digit')
  await assert.rejects(insert('08699546090099', 'retired'), /CHECK/, 'unknown status')
  await assert.rejects(insert('08699809018853', 'classified'), /UNIQUE|PRIMARY/, 'duplicate GTIN')
  const { results } = await db.prepare('PRAGMA foreign_key_list(catalog_products)').all()
  assert.deepEqual(results, [], 'no foreign keys')
})
