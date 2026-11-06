import assert from 'node:assert/strict'
import { createRequire, registerHooks } from 'node:module'
import { after, test } from 'node:test'

// Replace server-only wiring, leaving the feature gateways and transport intact.
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'server-only')
      return {
        url: new URL('./helpers/server-wiring.cjs', import.meta.url).href,
        shortCircuit: true,
      }
    if (specifier === '@/features/auth/server')
      return {
        url: new URL('./helpers/server-wiring.cjs', import.meta.url).href,
        shortCircuit: true,
      }
    return nextResolve(specifier, context)
  },
})
const require = createRequire(import.meta.url)
const { send: medicineSend } = require('../src/features/medicines/server.ts')
const { send: scheduleSend } = require('../src/features/schedules/server.ts')
const originalFetch = globalThis.fetch
const originalUrl = process.env.MEDICINES_WORKER_URL
const originalSecret = process.env.MEDICINES_WORKER_SECRET
process.env.MEDICINES_WORKER_URL = 'https://worker.test'
process.env.MEDICINES_WORKER_SECRET = 'synthetic-capability'
after(() => {
  globalThis.fetch = originalFetch
  for (const [key, value] of [
    ['MEDICINES_WORKER_URL', originalUrl],
    ['MEDICINES_WORKER_SECRET', originalSecret],
  ]) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
  hooks.deregister()
})
const list = { operation: 'list', ownerId: 'google:test' }
test('gateway preserves Worker status mapping and hides network, redirect and JSON failures', async () => {
  for (const [upstream, status, code] of [
    [400, 400, 'validation'],
    [409, 409, 'conflict'],
    [401, 503, 'unavailable'],
    [500, 503, 'unavailable'],
  ]) {
    globalThis.fetch = async () => new Response('{}', { status: upstream })
    await assert.rejects(() => medicineSend(list), { status, code })
  }
  for (const error of [
    new DOMException('timeout', 'TimeoutError'),
    new TypeError('redirect rejected'),
  ]) {
    globalThis.fetch = async () => {
      throw error
    }
    await assert.rejects(() => medicineSend(list), { status: 503 })
  }
  globalThis.fetch = async () => new Response('{')
  await assert.rejects(() => medicineSend(list), { status: 503 })
})
test('gateway applies private capability, no-store, timeout and redirect rejection', async () => {
  globalThis.fetch = async (url, options) => {
    assert.equal(url.href, 'https://worker.test/medicines')
    assert.equal(options.method, 'POST')
    assert.equal(options.headers.Authorization, 'Bearer synthetic-capability')
    assert.equal(options.cache, 'no-store')
    assert.equal(options.redirect, 'error')
    assert.ok(options.signal instanceof AbortSignal)
    assert.deepEqual(JSON.parse(options.body), list)
    return Response.json({ medicines: [] })
  }
  assert.deepEqual(await medicineSend(list), [])
})
test('feature decoders preserve malformed envelope and invalid field mappings', async () => {
  for (const payload of [null, [], {}, { medicines: null }, { medicines: [{}] }]) {
    globalThis.fetch = async () => Response.json(payload)
    await assert.rejects(() => medicineSend(list), { status: payload?.medicines?.[0] ? 400 : 503 })
  }
  for (const payload of [
    null,
    {},
    { schedules: [{}], records: [] },
    { schedules: [], records: [{}] },
  ]) {
    globalThis.fetch = async () => Response.json(payload)
    await assert.rejects(
      () => scheduleSend({ ...list, operation: 'listOutcomes', date: '2026-11-06' }),
      { status: 503 },
    )
  }
})

test('schedules HTTP dispatch retains omitted Taken, strict Skipped and session owner', async () => {
  const { PUT } = require('../src/app/api/schedules/route.ts')
  const scheduleId = '10000000-0000-4000-8000-000000000001'
  const dueAt = '2026-11-06T06:00:00.000Z'
  const takenAt = '2026-11-06T06:05:00.000Z'
  const put = (input) =>
    PUT(
      new Request('https://meddies.test/api/schedules', {
        method: 'PUT',
        headers: { origin: 'https://meddies.test', 'content-type': 'application/json' },
        body: JSON.stringify(input),
      }),
    )
  globalThis.fetch = async (_, options) => {
    const command = JSON.parse(options.body)
    assert.equal(command.ownerId, 'google:test')
    assert.equal(command.record.ownerId, undefined)
    return Response.json({
      records: [
        {
          ...command.record,
          outcome: command.operation === 'recordTaken' ? 'Taken' : 'Skipped',
          recordedAt: dueAt,
        },
      ],
    })
  }
  const taken = await put({ scheduleId, dueAt, takenAt, quantity: 1, ownerId: 'google:other' })
  assert.equal(taken.status, 200)
  assert.deepEqual(await taken.json(), {
    record: { scheduleId, dueAt, takenAt, quantity: 1, outcome: 'Taken' },
  })
  const skipped = await put({ scheduleId, dueAt, outcome: 'Skipped', ownerId: 'google:other' })
  assert.equal(skipped.status, 200)
  assert.deepEqual(await skipped.json(), {
    record: { scheduleId, dueAt, outcome: 'Skipped', recordedAt: dueAt },
  })
  assert.equal((await put({ scheduleId, dueAt, outcome: 'Skipped', quantity: 1 })).status, 400)
  const { setAuthenticated } = require('./helpers/server-wiring.cjs')
  setAuthenticated(false)
  try {
    assert.equal((await put({ outcome: 'Invalid' })).status, 400)
    assert.equal((await put({ outcome: 'Skipped', quantity: 1 })).status, 400)
    assert.equal((await put({})).status, 401)
    assert.equal((await put({ outcome: 'Skipped' })).status, 401)
  } finally {
    setAuthenticated(true)
  }
})

test('Taken-only decoding drops metadata while outcome decoding preserves it', async () => {
  const record = {
    scheduleId: '10000000-0000-4000-8000-000000000001',
    dueAt: '2026-11-06T06:00:00.000Z',
    takenAt: '2026-11-06T06:05:00.000Z',
    quantity: 1,
    outcome: 'Taken',
    revision: 2,
    actionId: '10000000-0000-4000-8000-000000000002',
  }
  globalThis.fetch = async () => Response.json({ schedules: [], records: [record] })
  const { revision, actionId, ...legacy } = record
  assert.deepEqual(await scheduleSend({ ...list, date: '2026-11-06' }), {
    schedules: [],
    records: [legacy],
  })
  assert.deepEqual(
    await scheduleSend({ operation: 'recordTaken', ownerId: list.ownerId, record: legacy }),
    { records: [legacy] },
  )
  assert.deepEqual(await scheduleSend({ ...list, operation: 'listOutcomes', date: '2026-11-06' }), {
    schedules: [],
    records: [record],
  })
  assert.equal(revision, 2)
  assert.ok(actionId)
})

test('transport uses a ten-second deadline and rejects missing or insecure configuration', async () => {
  const timeout = AbortSignal.timeout
  AbortSignal.timeout = (milliseconds) => {
    assert.equal(milliseconds, 10000)
    return new AbortController().signal
  }
  try {
    globalThis.fetch = async () => Response.json({ medicines: [] })
    assert.deepEqual(await medicineSend(list), [])
    globalThis.fetch = async () => assert.fail('invalid configuration must not reach fetch')
    for (const url of ['', 'http://worker.test', 'not a url']) {
      process.env.MEDICINES_WORKER_URL = url
      await assert.rejects(() => medicineSend(list), { status: 503 })
    }
  } finally {
    AbortSignal.timeout = timeout
    process.env.MEDICINES_WORKER_URL = 'https://worker.test'
  }
})
