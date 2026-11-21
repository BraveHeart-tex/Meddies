import assert from 'node:assert/strict'
import { afterEach, beforeAll, test, vi } from 'vitest'
import { createWorker } from '../worker/index'
import { runtime, secret, startWorkerRuntime } from './helpers/medicine-storage-runtime'

startWorkerRuntime()
let db: D1Database
beforeAll(async () => {
  db = await runtime.getD1Database('DB')
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  vi.useRealTimers()
})
const url = 'https://hc-ping.com/synthetic-check-secret'
const env = () => ({
  DB: db,
  MEDICINES_WORKER_SECRET: secret,
  SCHEDULER_SECRET: secret,
  HEARTBEAT_URL: url,
})
const request = () =>
  new Request('http://worker/due-reminders', {
    method: 'POST',
    headers: { authorization: `Bearer ${secret}` },
  })
const worker = () =>
  createWorker(
    () => new Date('2038-01-01T06:00:00Z'),
    () => ({
      submit: async () => ({ outcome: 'accepted' }),
    }),
  )

test('Healthy runs ping once from cron and command without sending reminder or owner data', async () => {
  const fetch = vi.fn(async () => new Response())
  vi.stubGlobal('fetch', fetch)
  const pending: Promise<unknown>[] = []
  const context = {
    waitUntil: (promise: Promise<unknown>) => {
      pending.push(promise)
    },
  }
  const ready = worker()
  await ready.scheduled(undefined, env(), context)
  const response = await ready.fetch(request(), env(), context)
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { submitted: 0, dropped: 0, retrying: 0 })
  await Promise.all(pending)
  assert.equal(pending.length, 2)
  assert.equal(fetch.mock.calls.length, 2)
  for (const call of fetch.mock.calls) {
    const [input, init] = call as unknown as Parameters<typeof globalThis.fetch>
    const ping = new Request(input, init)
    assert.equal(ping.url, url)
    assert.equal(ping.method, 'GET')
    // Workers rejects redirect 'error' with a TypeError, which the silent catch would hide.
    assert.equal(ping.redirect, 'manual')
    assert.equal(await ping.text(), '')
    assert.deepEqual([...ping.headers], [])
  }
})

test('only accepted or device-gone Delivery attempts make a nonempty inclusive 80-minute window Healthy', async () => {
  const fetch = vi.fn(async () => new Response())
  vi.stubGlobal('fetch', fetch)
  const seed = async (outcome: string, attemptedAt: string, code: string | null = null) => {
    await db
      .prepare(
        `INSERT INTO delivery_attempts
      (id, owner_id, schedule_id, due_at, installation_id, outcome, attempted_at, code)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        crypto.randomUUID(),
        'google:private-owner',
        'synthetic-schedule',
        '2038-01-01T04:40:00.000Z',
        'private-installation',
        outcome,
        attemptedAt,
        code,
      )
      .run()
  }
  for (const { attempts, pings } of [
    { attempts: [], pings: 1 },
    {
      attempts: [
        ['rejected', '2038-01-01T04:40:00.000Z', 'SENDER_ID_MISMATCH'],
        ['rejected', '2038-01-01T06:00:00.000Z', 'PERMISSION_DENIED'],
        ['rejected', '2038-01-01T05:59:00.000Z', 'INVALID_ARGUMENT'],
      ],
      pings: 0,
    },
    { attempts: [['rejected', '2038-01-01T06:00:00.000Z']], pings: 0 },
    { attempts: [['transient', '2038-01-01T04:40:00.000Z']], pings: 0 },
    {
      attempts: [
        ['transient', '2038-01-01T06:00:00.000Z'],
        ['accepted', '2038-01-01T04:39:59.999Z'],
      ],
      pings: 0,
    },
    { attempts: [['transient', '2038-01-01T04:39:59.999Z']], pings: 1 },
    {
      attempts: [
        ['transient', '2038-01-01T06:00:00.000Z'],
        ['accepted', '2038-01-01T04:40:00.000Z'],
      ],
      pings: 1,
    },
    {
      attempts: [
        ['transient', '2038-01-01T06:00:00.000Z'],
        ['rejected', '2038-01-01T05:59:00.000Z', 'INVALID_ARGUMENT'],
        ['accepted', '2038-01-01T06:00:00.000Z'],
      ],
      pings: 1,
    },
    ...['UNREGISTERED', 'NOT_FOUND'].map((code) => ({
      attempts: [['rejected', '2038-01-01T06:00:00.000Z', code]],
      pings: 1,
    })),
    {
      attempts: [['transient', '2038-01-01T06:00:00.000Z', 'NOT_FOUND']],
      pings: 0,
    },
    {
      attempts: [
        ['rejected', '2038-01-01T05:59:00.000Z', 'INVALID_ARGUMENT'],
        ['rejected', '2038-01-01T06:00:00.001Z', 'UNREGISTERED'],
      ],
      pings: 0,
    },
  ]) {
    await db.prepare('DELETE FROM delivery_attempts').run()
    fetch.mockClear()
    for (const [outcome, at, code] of attempts) await seed(outcome, at, code)
    const pending: Promise<unknown>[] = []
    const response = await worker().fetch(request(), env(), {
      waitUntil: (promise) => {
        pending.push(promise)
      },
    })
    assert.equal(response.status, 200)
    await Promise.all(pending)
    assert.equal(fetch.mock.calls.length, pings, JSON.stringify(attempts))
  }
  await db.prepare('DELETE FROM delivery_attempts').run()
})

test('failed runs and missing secrets never ping; rejected and stalled pings cannot change run results', async () => {
  const fetch = vi.fn<typeof globalThis.fetch>()
  vi.stubGlobal('fetch', fetch)
  const failed = createWorker(undefined, () => {
    throw new Error('synthetic failure')
  })
  await assert.rejects(failed.scheduled(undefined, env()), { message: 'internal' })
  assert.equal((await failed.fetch(request(), env())).status, 503)
  assert.equal(
    (await worker().fetch(request(), { ...env(), HEARTBEAT_URL: undefined })).status,
    200,
  )
  await worker().scheduled(undefined, { ...env(), HEARTBEAT_URL: undefined })
  assert.equal(fetch.mock.calls.length, 0)

  for (const slow of [false, true]) {
    fetch.mockImplementation(() =>
      slow ? new Promise(() => {}) : Promise.reject(new Error('private ping error')),
    )
    const pending: Promise<unknown>[] = []
    // Fake only the heartbeat timer; real-D1 I/O continues on real scheduling.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const response = await worker().fetch(request(), env(), {
      waitUntil: (promise) => {
        pending.push(promise)
      },
    })
    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), { submitted: 0, dropped: 0, retrying: 0 })
    assert.equal(pending.length, 1)
    if (slow) {
      const signal = fetch.mock.lastCall?.[1]?.signal
      assert.equal(signal?.aborted, false)
      await vi.advanceTimersByTimeAsync(5_001)
      assert.equal(signal?.aborted, true)
    }
    await Promise.all(pending)
    vi.useRealTimers()
  }
})
