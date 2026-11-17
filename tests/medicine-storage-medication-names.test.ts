import assert from 'node:assert/strict'
import { randomBytes, randomUUID } from 'node:crypto'
import { beforeAll, test, vi } from 'vitest'
import { createWorker } from '../worker/index'
import { GET, PUT } from '../src/app/api/medication-names/route'
import { startWorkerRuntime, runtime, secret } from './helpers/medicine-storage-runtime'
import { installSyntheticWorker } from './helpers/synthetic-worker'
import { setQuietHours } from '../worker/quiet-hours'
import { drizzle } from 'drizzle-orm/d1'

// Medication names on real D1, through the API routes, server wiring and Worker (#37).
const session = vi.hoisted(() => ({ id: 'google:names-a' as string | null }))
vi.mock('server-only', () => ({}))
vi.mock('@/features/auth/server', () => ({
  requireUser: async () => {
    if (!session.id) throw new Error('synthetic unauthenticated session')
    return { id: session.id }
  },
}))
startWorkerRuntime()
installSyntheticWorker()

let db: D1Database
beforeAll(async () => {
  db = await runtime.getD1Database('DB')
  process.env.MEDICINES_WORKER_SECRET = secret
  const worker = createWorker(() => new Date('2026-11-17T10:00:00.000Z'))
  globalThis.fetch = async (url, init) =>
    worker.fetch(
      new Request(url as URL, { method: init!.method, headers: init!.headers, body: init!.body }),
      { DB: db, MEDICINES_WORKER_SECRET: secret },
    )
})

const owner = () => `google:${randomBytes(8).toString('hex')}`
const as = (ownerId: string | null) => {
  session.id = ownerId
}
const origin = 'http://app.test'
const answer = async (response: Response) => ({
  status: response.status,
  body: await response.json(),
})
const read = async () => answer(await GET())
const set = async (actionId: string, medicationNames: boolean) =>
  answer(
    await PUT(
      new Request(`${origin}/api/medication-names`, {
        method: 'PUT',
        headers: { origin, 'content-type': 'application/json' },
        body: JSON.stringify({ actionId, medicationNames }),
      }),
    ),
  )
const stored = async (ownerId: string) => {
  const preference = await db
    .prepare('SELECT medication_names AS medicationNames FROM account_preferences WHERE owner_id=?')
    .bind(ownerId)
    .first<{ medicationNames: number }>()
  const receipts = await db
    .prepare('SELECT COUNT(*) AS count FROM medication_names_receipts WHERE owner_id=?')
    .bind(ownerId)
    .first<{ count: number }>()
  return { medicationNames: preference?.medicationNames ?? null, receipts: receipts!.count }
}

test('Medication names read as off until set, and a set changes only the signed-in account', async () => {
  const [a, b] = [owner(), owner()]
  as(a)
  assert.deepEqual(await read(), { status: 200, body: { medicationNames: false } })
  as(b)
  assert.deepEqual(await read(), { status: 200, body: { medicationNames: false } })

  as(a)
  assert.deepEqual(await set(randomUUID(), true), { status: 200, body: { medicationNames: true } })
  assert.deepEqual(await read(), { status: 200, body: { medicationNames: true } })
  as(b)
  assert.deepEqual(await read(), { status: 200, body: { medicationNames: false } }, 'b keeps off')
  assert.deepEqual(await stored(b), { medicationNames: null, receipts: 0 })

  as(a)
  assert.deepEqual(await set(randomUUID(), false), {
    status: 200,
    body: { medicationNames: false },
  })
  assert.deepEqual(await read(), { status: 200, body: { medicationNames: false } })

  as(null)
  assert.equal((await read()).status, 401)
  assert.equal((await set(randomUUID(), true)).status, 401)
  as(a)
  assert.equal((await set('not-a-uuid', true)).status, 400)
  assert.deepEqual(await stored(a), { medicationNames: 0, receipts: 2 })
})

test('A retried set returns its original outcome and writes nothing, even after a newer set', async () => {
  const a = owner()
  as(a)
  const on = randomUUID()
  assert.deepEqual(await set(on, true), { status: 200, body: { medicationNames: true } })
  assert.deepEqual(await set(on, true), { status: 200, body: { medicationNames: true } })
  assert.deepEqual(await stored(a), { medicationNames: 1, receipts: 1 })

  assert.deepEqual(await set(randomUUID(), false), {
    status: 200,
    body: { medicationNames: false },
  })
  assert.deepEqual(
    await set(on, true),
    { status: 200, body: { medicationNames: true } },
    'a late retry returns its original outcome',
  )
  assert.deepEqual(
    await read(),
    { status: 200, body: { medicationNames: false } },
    'newer choice kept',
  )
  assert.deepEqual(await stored(a), { medicationNames: 0, receipts: 2 })

  assert.deepEqual(
    await set(on, false),
    { status: 409, body: { error: 'conflict' } },
    'a reused action ID with another value',
  )
  assert.deepEqual(await stored(a), { medicationNames: 0, receipts: 2 })

  const other = owner()
  as(other)
  assert.deepEqual(
    await set(on, false),
    { status: 200, body: { medicationNames: false } },
    "another account's action ID is its own",
  )
})

test('Medication names and Quiet hours read and set independently', async () => {
  const a = owner()
  as(a)
  await setQuietHours(drizzle(db), a, { actionId: randomUUID(), quietHours: true }, new Date())
  assert.deepEqual(await read(), { status: 200, body: { medicationNames: false } })
  assert.deepEqual(await set(randomUUID(), true), { status: 200, body: { medicationNames: true } })
  await setQuietHours(drizzle(db), a, { actionId: randomUUID(), quietHours: false }, new Date())
  assert.deepEqual(await read(), { status: 200, body: { medicationNames: true } })
  const row = await db
    .prepare('SELECT quiet_hours, medication_names FROM account_preferences WHERE owner_id=?')
    .bind(a)
    .first()
  assert.deepEqual(row, { quiet_hours: 0, medication_names: 1 })
})
