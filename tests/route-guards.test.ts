import assert from 'node:assert/strict'
import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { test, vi } from 'vitest'
// Mocked below; the synthetic wiring lets tests toggle the session.
import { setAuthenticated } from './helpers/server-wiring'
import { installSyntheticWorker } from './helpers/synthetic-worker'

// Shared guards of every private API route, proven once per route and method. A route
// file or method missing from `routes` fails the table check. Per-operation request
// bodies, invalid input and decoding stay in gateway.test.ts.
vi.mock('server-only', () => ({}))
vi.mock('@/features/auth/server', () => import('./helpers/server-wiring'))
installSyntheticWorker()

const id = '10000000-0000-4000-8000-000000000001'
const basedOnId = '10000000-0000-4000-8000-000000000002'
const dueAt = '2026-11-03T06:00:00.000Z'
const takenAt = '2026-11-03T06:05:00.000Z'
const version = { id, basedOnId }
// `body` is a valid request, so a signed-in call reaches the Worker. `worker: false`
// marks a route that never calls it; `reads` counts Worker calls per request (default 1).
const routes: Record<string, { body?: unknown; query?: string; worker?: false; reads?: number }> = {
  'medicines GET': {},
  'medicines POST': { body: { id, label: 'Iron', strength: null, unit: 'tablet' } },
  // Today reads today's and yesterday's records (#275).
  'schedules GET': { reads: 2 },
  'schedules POST': {
    body: {
      id,
      medicineId: basedOnId,
      startDate: '2026-11-03',
      times: [{ time: '09:00', quantity: 1 }],
    },
  },
  'schedules PUT': { body: { scheduleId: id, dueAt, takenAt, quantity: 1 } },
  'schedules PATCH': {
    body: {
      scheduleId: id,
      dueAt,
      actionId: basedOnId,
      expectedRevision: 0,
      expectedOutcome: 'Taken',
      outcome: 'Skipped',
    },
  },
  'schedules/edit POST': {
    body: { ...version, endDate: null, times: [{ time: '10:00', quantity: 1 }] },
  },
  'schedules/history GET': { query: '?date=2026-11-03' },
  'schedules/pause POST': { body: version },
  'schedules/resume POST': { body: version },
  'schedules/stop POST': { body: version },
  'schedules/unscheduled POST': {
    body: { actionId: id, medicineId: basedOnId, takenAt, quantity: 1 },
  },
  'schedules/unscheduled PATCH': {
    body: { actionId: basedOnId, doseId: id, expectedRevision: 0, removed: true },
  },
  'session GET': { worker: false },
}
// Auth.js keeps its own protocol guards (docs/authentication.md).
const publicRoutes = new Set(['auth/[...nextauth]'])
const methods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const
type Handler = (request: Request) => Promise<Response>

async function privateRoutes() {
  const root = join(import.meta.dirname, '../src/app/api')
  const found = new Map<string, Handler>()
  for (const file of readdirSync(root, { recursive: true, encoding: 'utf8' })) {
    if (!file.endsWith('route.ts')) continue
    const path = file.slice(0, -'/route.ts'.length)
    if (publicRoutes.has(path)) continue
    const route = (await import(join(root, file))) as Partial<Record<string, Handler>>
    for (const method of methods) {
      const handler = route[method]
      if (handler) found.set(`${path} ${method}`, handler)
    }
  }
  return found
}

test('every private API route and method has a guard table entry', async () => {
  assert.deepEqual([...(await privateRoutes()).keys()].sort(), Object.keys(routes).sort())
})

test('private API routes reject cross-origin writes and signed-out requests, never cache and map Worker status', async () => {
  let calls = 0
  let upstream = 200
  globalThis.fetch = async () => {
    calls++
    return new Response('{}', { status: upstream })
  }
  for (const [key, handler] of await privateRoutes()) {
    const [path, method] = key.split(' ')
    const { body, query = '', worker, reads = 1 } = routes[key]
    const call = async (origin = 'https://meddies.test') => {
      const response = await handler(
        new Request(`https://meddies.test/api/${path}${query}`, {
          method,
          headers: { origin, 'content-type': 'application/json' },
          body: body === undefined ? undefined : JSON.stringify(body),
        }),
      )
      assert.equal(response.headers.get('cache-control'), 'no-store', key)
      return response.status
    }
    calls = 0
    if (method !== 'GET') assert.equal(await call('https://other.test'), 403, key)
    setAuthenticated(false)
    try {
      assert.equal(await call(), 401, key)
    } finally {
      setAuthenticated(true)
    }
    assert.equal(calls, 0, key)
    if (worker === false) {
      assert.equal(await call(), 200, key)
      continue
    }
    for (const [status, expected] of [
      [400, 400],
      [409, 409],
      [500, 503],
    ]) {
      upstream = status
      assert.equal(await call(), expected, `${key} Worker ${status}`)
    }
    assert.equal(calls, 3 * reads, key)
  }
})

// Page aliases are separate from the private API guard table above.
test('page route guard table redirects sign-in to the existing entry', async () => {
  const { default: config } = await import('../next.config')
  const redirects = await config.redirects!()
  assert.deepEqual(redirects, [{ source: '/sign-in', destination: '/', permanent: false }])
})
