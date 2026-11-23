import assert from 'node:assert/strict'
import { afterEach, test, vi } from 'vitest'
import { normalizeGtin } from '../src/features/catalog-products/contract'
import { GET } from '../src/app/api/catalog-products/route'
import { setAuthenticated } from './helpers/server-wiring'
import { installSyntheticWorker } from './helpers/synthetic-worker'

// The GTIN-14 normalizer and the Catalog product lookup route over a synthetic Worker (#196).
// Real-D1 lookups live in medicine-storage-catalog-products.test.ts.
vi.mock('server-only', () => ({}))
vi.mock('@/features/auth/server', () => import('./helpers/server-wiring'))
installSyntheticWorker()

afterEach(() => {
  vi.restoreAllMocks()
  setAuthenticated(true)
})

test('normalization left-pads EAN-8, UPC-A and EAN-13 to GTIN-14 and keeps a GTIN-14', () => {
  assert.equal(normalizeGtin('96385074'), '00000096385074', 'EAN-8')
  assert.equal(normalizeGtin('036000291452'), '00036000291452', 'UPC-A')
  assert.equal(normalizeGtin('8699809018853'), '08699809018853', 'EAN-13')
  assert.equal(normalizeGtin('08699809018853'), '08699809018853', 'GTIN-14')
  assert.equal(normalizeGtin('18699809018850'), '18699809018850', 'GTIN-14 with indicator digit')
})

test('normalization rejects failed check digits, other lengths and non-digits', () => {
  for (const value of [
    '8699809018854', // EAN-13, check digit off by one
    '036000291453', // UPC-A
    '96385075', // EAN-8
    '08699809018850', // GTIN-14
    '',
    '1234567', // 7 digits
    '86998090188', // 11 digits
    '123456789', // 9 digits
    '086998090188530', // 15 digits
    ' 8699809018853',
    '8699809018853\n',
    '(01)08699809018853',
    '869980901885a',
    '٨٦٩٩٨٠٩٠١٨٨٥٣', // Arabic-Indic digits
  ])
    assert.equal(normalizeGtin(value), null, JSON.stringify(value))
})

const lookup = async (barcode?: string) => {
  const query = barcode === undefined ? '' : `?barcode=${encodeURIComponent(barcode)}`
  const response = await GET(new Request(`https://meddies.test/api/catalog-products${query}`))
  return { status: response.status, body: await response.json() }
}

test('an unknown barcode answers noMatch; a Worker failure answers unavailable', async () => {
  const sent: unknown[] = []
  let upstream: Response = Response.json({ outcome: 'noMatch' })
  globalThis.fetch = async (_url, init) => {
    sent.push(JSON.parse(String(init!.body)))
    return upstream
  }
  assert.deepEqual(await lookup('8699809018853'), { status: 200, body: { outcome: 'noMatch' } })
  assert.deepEqual(sent, [{ operation: 'lookup', ownerId: 'google:test', gtin: '08699809018853' }])

  upstream = new Response('{}', { status: 500 })
  assert.deepEqual(await lookup('8699809018853'), { status: 503, body: { error: 'unavailable' } })

  upstream = Response.json({ outcome: 'match', name: 1, strength: null, type: null })
  assert.deepEqual(
    await lookup('8699809018853'),
    { status: 503, body: { error: 'unavailable' } },
    'an unexpected Worker response is a failure, not a match',
  )
})

test('a bad check digit or a non-GTIN value answers noMatch without calling the Worker', async () => {
  let calls = 0
  globalThis.fetch = async () => {
    calls++
    return Response.json({ outcome: 'noMatch' })
  }
  for (const value of ['8699809018854', '', 'https://example.test/qr', '1234567'])
    assert.deepEqual(await lookup(value), { status: 200, body: { outcome: 'noMatch' } }, value)
  assert.deepEqual(await lookup(), { status: 400, body: { error: 'validation' } }, 'no barcode')
  assert.equal(calls, 0)
})

test('lookup requires the signed-in session and logs no barcode values', async () => {
  let calls = 0
  globalThis.fetch = async () => {
    calls++
    throw new TypeError('network down')
  }
  const logged: unknown[] = []
  for (const method of ['log', 'info', 'warn', 'error', 'debug'] as const)
    vi.spyOn(console, method).mockImplementation((...values) => void logged.push(...values))

  setAuthenticated(false)
  assert.deepEqual(await lookup('8699809018853'), { status: 401, body: { error: 'unauthorized' } })
  assert.equal(calls, 0, 'a signed-out lookup never reaches the Worker')

  setAuthenticated(true)
  assert.deepEqual(await lookup('8699809018853'), { status: 503, body: { error: 'unavailable' } })
  assert.equal(calls, 1)
  assert.ok(logged.length, 'the failure is logged')
  const text = JSON.stringify(logged)
  for (const digits of ['8699809018853', '08699809018853', '9809018'])
    assert.ok(!text.includes(digits), `log carries ${digits}: ${text}`)
})
