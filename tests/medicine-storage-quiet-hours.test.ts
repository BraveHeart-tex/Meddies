import assert from 'node:assert/strict'
import { randomBytes, randomUUID } from 'node:crypto'
import { beforeAll, test, vi } from 'vitest'
import { createWorker } from '../worker/index'
import { GET, PUT } from '../src/app/api/quiet-hours/route'
import { startWorkerRuntime, runtime, secret } from './helpers/medicine-storage-runtime'
import { installSyntheticWorker } from './helpers/synthetic-worker'

// Quiet hours on real D1, through the API routes, server wiring and Worker (#35).
const session = vi.hoisted(() => ({ id: 'google:quiet-a' as string | null }))
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
const set = async (actionId: string, quietHours: boolean) =>
  answer(
    await PUT(
      new Request(`${origin}/api/quiet-hours`, {
        method: 'PUT',
        headers: { origin, 'content-type': 'application/json' },
        body: JSON.stringify({ actionId, quietHours }),
      }),
    ),
  )
const stored = async (ownerId: string) => {
  const preference = await db
    .prepare('SELECT quiet_hours AS quietHours FROM account_preferences WHERE owner_id=?')
    .bind(ownerId)
    .first<{ quietHours: number }>()
  const receipts = await db
    .prepare('SELECT COUNT(*) AS count FROM quiet_hours_receipts WHERE owner_id=?')
    .bind(ownerId)
    .first<{ count: number }>()
  return { quietHours: preference?.quietHours ?? null, receipts: receipts!.count }
}

test('Quiet hours read as off until set, and a set changes only the signed-in account', async () => {
  const [a, b] = [owner(), owner()]
  as(a)
  assert.deepEqual(await read(), { status: 200, body: { quietHours: false } })
  as(b)
  assert.deepEqual(await read(), { status: 200, body: { quietHours: false } })

  as(a)
  assert.deepEqual(await set(randomUUID(), true), { status: 200, body: { quietHours: true } })
  assert.deepEqual(await read(), { status: 200, body: { quietHours: true } })
  as(b)
  assert.deepEqual(await read(), { status: 200, body: { quietHours: false } }, 'b keeps off')
  assert.deepEqual(await stored(b), { quietHours: null, receipts: 0 })

  as(a)
  assert.deepEqual(await set(randomUUID(), false), { status: 200, body: { quietHours: false } })
  assert.deepEqual(await read(), { status: 200, body: { quietHours: false } })

  as(null)
  assert.equal((await read()).status, 401)
  assert.equal((await set(randomUUID(), true)).status, 401)
  as(a)
  assert.equal((await set('not-a-uuid', true)).status, 400)
  assert.deepEqual(await stored(a), { quietHours: 0, receipts: 2 })
})

test('A retried set returns its original outcome and writes nothing, even after a newer set', async () => {
  const a = owner()
  as(a)
  const on = randomUUID()
  assert.deepEqual(await set(on, true), { status: 200, body: { quietHours: true } })
  assert.deepEqual(await set(on, true), { status: 200, body: { quietHours: true } })
  assert.deepEqual(await stored(a), { quietHours: 1, receipts: 1 })

  assert.deepEqual(await set(randomUUID(), false), { status: 200, body: { quietHours: false } })
  assert.deepEqual(
    await set(on, true),
    { status: 200, body: { quietHours: true } },
    'a late retry returns its original outcome',
  )
  assert.deepEqual(await read(), { status: 200, body: { quietHours: false } }, 'newer choice kept')
  assert.deepEqual(await stored(a), { quietHours: 0, receipts: 2 })

  assert.deepEqual(
    await set(on, false),
    { status: 409, body: { error: 'conflict' } },
    'a reused action ID with another value',
  )
  assert.deepEqual(await stored(a), { quietHours: 0, receipts: 2 })

  const other = owner()
  as(other)
  assert.deepEqual(
    await set(on, false),
    { status: 200, body: { quietHours: false } },
    "another account's action ID is its own",
  )
})
