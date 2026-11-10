import type { MedicineCommand } from '../src/features/medicines/contract'
import type { DoseRecord } from '../src/features/schedules/contract'
import assert from 'node:assert/strict'
import { afterAll, test, vi } from 'vitest'
import { send as medicineSend } from '../src/features/medicines/server'
import { send as scheduleSend } from '../src/features/schedules/server'
import { PUT } from '../src/app/api/schedules/route'
// Mocked below; the synthetic wiring lets tests toggle the session.
import { setAuthenticated } from './helpers/server-wiring'

// Replace server-only wiring, leaving the feature gateways and transport intact.
vi.mock('server-only', () => ({}))
vi.mock('@/features/auth/server', () => import('./helpers/server-wiring'))
const originalFetch = globalThis.fetch
const originalUrl = process.env.MEDICINES_WORKER_URL
const originalSecret = process.env.MEDICINES_WORKER_SECRET
process.env.MEDICINES_WORKER_URL = 'https://worker.test'
process.env.MEDICINES_WORKER_SECRET = 'synthetic-capability'
afterAll(() => {
  globalThis.fetch = originalFetch
  for (const [key, value] of [
    ['MEDICINES_WORKER_URL', originalUrl],
    ['MEDICINES_WORKER_SECRET', originalSecret],
  ] as const) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
})
const list: Extract<MedicineCommand, { operation: 'list' }> = {
  operation: 'list',
  ownerId: 'google:test',
}
test('gateway preserves Worker status mapping and hides network, redirect and JSON failures', async () => {
  for (const [upstream, status, code] of [
    [400, 400, 'validation'],
    [409, 409, 'conflict'],
    [401, 503, 'unavailable'],
    [500, 503, 'unavailable'],
  ] as const) {
    globalThis.fetch = async () => new Response('{}', { status: upstream })
    await assert.rejects(() => medicineSend(list), { status, code })
  }
  for (const error of [
    new DOMException('timeout', 'TimeoutError'),
    new TypeError('redirect rejected'),
  ] as const) {
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
    assert.equal((url as URL).href, 'https://worker.test/medicines')
    assert.equal(options!.method, 'POST')
    assert.equal(
      (options!.headers as Record<string, string>).Authorization,
      'Bearer synthetic-capability',
    )
    assert.equal(options!.cache, 'no-store')
    assert.equal(options!.redirect, 'error')
    assert.ok(options!.signal instanceof AbortSignal)
    assert.deepEqual(JSON.parse(options!.body as string), list)
    return Response.json({ medicines: [] })
  }
  assert.deepEqual(await medicineSend(list), [])
})
test('feature decoders preserve malformed envelope and invalid field mappings', async () => {
  for (const payload of [null, [], {}, { medicines: null }, { medicines: [{}] }] as const) {
    globalThis.fetch = async () => Response.json(payload)
    await assert.rejects(() => medicineSend(list), {
      status: (payload as { medicines?: unknown[] } | null)?.medicines?.[0] ? 400 : 503,
    })
  }
  for (const payload of [
    null,
    {},
    { schedules: [{}], records: [] },
    { schedules: [], records: [{}] },
  ] as const) {
    globalThis.fetch = async () => Response.json(payload)
    await assert.rejects(
      () => scheduleSend({ ...list, operation: 'listOutcomes', date: '2026-11-06' }),
      { status: 503 },
    )
  }
})

test('schedules HTTP dispatch retains omitted Taken, strict Skipped and session owner', async () => {
  const scheduleId = '10000000-0000-4000-8000-000000000001'
  const dueAt = '2026-11-06T06:00:00.000Z'
  const takenAt = '2026-11-06T06:05:00.000Z'
  const put = (input: unknown) =>
    PUT(
      new Request('https://meddies.test/api/schedules', {
        method: 'PUT',
        headers: { origin: 'https://meddies.test', 'content-type': 'application/json' },
        body: JSON.stringify(input),
      }),
    )
  globalThis.fetch = async (_, options) => {
    const command = JSON.parse(options!.body as string)
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
  const record: DoseRecord = {
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

test('malformed Worker save fields are unavailable while genuine rejections remain validation errors', async () => {
  const command: MedicineCommand = {
    operation: 'save',
    ownerId: list.ownerId,
    medicine: {
      id: '10000000-0000-4000-8000-000000000001',
      label: 'Iron',
      strength: null,
      unit: 'tablet',
    },
  }
  for (const medicines of [[{}], [{ ...command.medicine, unit: 'invalid' }]]) {
    globalThis.fetch = async () => Response.json({ medicines })
    await assert.rejects(() => medicineSend(command), { status: 503, code: 'unavailable' })
  }
  globalThis.fetch = async () => new Response('{}', { status: 400 })
  await assert.rejects(() => medicineSend(command), { status: 400, code: 'validation' })
})

test('schedule gateway preserves Interval hours and normalizes legacy Clock schedules', async () => {
  const schedule = {
    id: '10000000-0000-4000-8000-000000000001',
    medicineId: '10000000-0000-4000-8000-000000000002',
    startDate: '2026-11-03',
    times: [{ time: '22:17', quantity: 1 }],
    confirmedAt: '2026-11-03T18:00:00.000Z',
  }
  for (const intervalHours of [null, 7]) {
    globalThis.fetch = async () =>
      Response.json({ schedules: [{ ...schedule, intervalHours }], records: [] })
    const decoded = await scheduleSend({
      operation: 'listOutcomes',
      ownerId: list.ownerId,
      date: '2026-11-03',
    })
    assert.equal(decoded.schedules[0].intervalHours, intervalHours)
  }
  globalThis.fetch = async () => Response.json({ schedules: [schedule], records: [] })
  assert.equal(
    (await scheduleSend({ operation: 'listOutcomes', ownerId: list.ownerId, date: '2026-11-03' }))
      .schedules[0].intervalHours,
    null,
  )
})

test('schedule edit HTTP boundary authenticates, guards requests and decodes version metadata', async () => {
  const { POST } = await import('../src/app/api/schedules/edit/route')
  const id = '10000000-0000-4000-8000-000000000003'
  const basedOnId = '10000000-0000-4000-8000-000000000001'
  const edit = { id, basedOnId, times: [{ time: '10:00', quantity: 1 }] }
  const schedule = {
    id,
    medicineId: '10000000-0000-4000-8000-000000000002',
    startDate: '2026-11-03',
    times: edit.times,
    confirmedAt: '2026-11-03T06:00:00.000Z',
    replacedAt: null,
  }
  let calls = 0
  globalThis.fetch = async (_url, options) => {
    calls++
    const command = JSON.parse(options!.body as string)
    assert.equal(command.ownerId, 'google:test')
    assert.equal(command.operation, 'edit')
    assert.equal(command.edit.basedOnId, basedOnId)
    return Response.json({ schedules: [schedule] })
  }
  const post = (
    body: unknown,
    headers: HeadersInit = { origin: 'https://meddies.test', 'content-type': 'application/json' },
  ) =>
    POST(
      new Request('https://meddies.test/api/schedules/edit', {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      }),
    )
  assert.equal((await post(edit, {})).status, 403)
  setAuthenticated(false)
  try {
    assert.equal((await post(edit)).status, 401)
  } finally {
    setAuthenticated(true)
  }
  assert.equal(calls, 0)
  const response = await post(edit)
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('cache-control'), 'no-store')
  const saved = await response.json()
  assert.equal(saved.schedules[0].id, id)
  assert.equal(saved.schedules[0].replacedAt, null)
  globalThis.fetch = async () => new Response('{}', { status: 409 })
  assert.equal((await post(edit)).status, 409)
  globalThis.fetch = async () =>
    Response.json({ schedules: [{ ...schedule, replacedAt: 'invalid' }] })
  assert.equal((await post(edit)).status, 503)
  globalThis.fetch = async () => Response.json({ schedules: [{ ...schedule, basedOnId: 42 }] })
  assert.equal((await post(edit)).status, 503)
  globalThis.fetch = async () =>
    Response.json({
      schedules: [{ ...schedule, basedOnId: id, replacedAt: '2026-11-04T06:00:00.000Z' }],
      records: [],
    })
  const decoded = await scheduleSend({
    operation: 'listOutcomes',
    ownerId: 'google:test',
    date: '2026-11-03',
  })
  assert.equal(decoded.schedules[0].replacedAt, '2026-11-04T06:00:00.000Z')
  assert.equal(decoded.schedules[0].basedOnId, id)
})
