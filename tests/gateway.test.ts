import type { MedicineCommand } from '../src/features/medicines/contract'
import type { DoseRecord } from '../src/features/schedules/contract'
import assert from 'node:assert/strict'
import { test, vi } from 'vitest'
import { send as medicineSend } from '../src/features/medicines/server'
import { send as scheduleSend } from '../src/features/schedules/server'
import { PUT } from '../src/app/api/schedules/route'
import { POST as editPost } from '../src/app/api/schedules/edit/route'
import { POST as stopPost } from '../src/app/api/schedules/stop/route'
import { POST as pausePost } from '../src/app/api/schedules/pause/route'
import { POST as resumePost } from '../src/app/api/schedules/resume/route'
import {
  POST as unscheduledPost,
  PATCH as unscheduledPatch,
} from '../src/app/api/schedules/unscheduled/route'
import { GET as historyGet } from '../src/app/api/schedules/history/route'
// Mocked below; the synthetic wiring lets tests toggle the session.
import { setAuthenticated } from './helpers/server-wiring'
import { installSyntheticWorker } from './helpers/synthetic-worker'

// Gateway transport and decoding, plus each route's request body and invalid input.
// Shared route guards (origin, session, no-store, Worker status): route-guards.test.ts.
// Replace server-only wiring, leaving the feature gateways and transport intact.
vi.mock('server-only', () => ({}))
vi.mock('@/features/auth/server', () => import('./helpers/server-wiring'))
installSyntheticWorker()
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
    unscheduledDoses: [],
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

const post = (
  route: (request: Request) => Promise<Response>,
  path: string,
  body: unknown,
  method = 'POST',
) =>
  route(
    new Request(`https://meddies.test/api/schedules/${path}`, {
      method,
      headers: { origin: 'https://meddies.test', 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  )

test('schedule edit HTTP boundary sends the session owner and decodes version metadata', async () => {
  const id = '10000000-0000-4000-8000-000000000003'
  const basedOnId = '10000000-0000-4000-8000-000000000001'
  const edit = { id, basedOnId, endDate: null, times: [{ time: '10:00', quantity: 1 }] }
  const schedule = {
    id,
    medicineId: '10000000-0000-4000-8000-000000000002',
    startDate: '2026-11-03',
    times: edit.times,
    confirmedAt: '2026-11-03T06:00:00.000Z',
    replacedAt: null,
  }
  globalThis.fetch = async (_url, options) => {
    const command = JSON.parse(options!.body as string)
    assert.equal(command.ownerId, 'google:test')
    assert.equal(command.operation, 'edit')
    assert.equal(command.edit.basedOnId, basedOnId)
    return Response.json({ schedules: [schedule] })
  }
  const response = await post(editPost, 'edit', edit)
  assert.equal(response.status, 200)
  const saved = await response.json()
  assert.equal(saved.schedules[0].id, id)
  assert.equal(saved.schedules[0].replacedAt, null)
  for (const malformed of [{ replacedAt: 'invalid' }, { basedOnId: 42 }]) {
    globalThis.fetch = async () => Response.json({ schedules: [{ ...schedule, ...malformed }] })
    assert.equal((await post(editPost, 'edit', edit)).status, 503)
  }
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

test('schedule stop, pause and resume HTTP boundaries send the version change and decode its result', async () => {
  const id = '10000000-0000-4000-8000-000000000003'
  const basedOnId = '10000000-0000-4000-8000-000000000001'
  const change = { id, basedOnId }
  const confirmedAt = '2026-11-03T11:00:00.000Z'
  const schedule = {
    id,
    basedOnId,
    medicineId: '10000000-0000-4000-8000-000000000002',
    startDate: '2026-11-03',
    times: [{ time: '08:00', quantity: 1 }],
    confirmedAt,
    endDate: null,
  }
  for (const [operation, route, saved, field, malformed] of [
    ['stop', stopPost, { stoppedAt: confirmedAt }, 'stoppedAt', ['invalid', null]],
    ['pause', pausePost, { pausedAt: confirmedAt }, 'pausedAt', ['invalid', null]],
    [
      'resume',
      resumePost,
      { pausedAt: null, stoppedAt: null },
      'pausedAt',
      ['invalid', confirmedAt],
    ],
  ] as const) {
    globalThis.fetch = async (_url, options) => {
      assert.deepEqual(JSON.parse(options!.body as string), {
        operation,
        ownerId: 'google:test',
        [operation]: change,
      })
      return Response.json({ schedules: [{ ...schedule, ...saved }] })
    }
    for (const invalid of [
      { ...change, id: 'invalid' },
      { ...change, basedOnId: id },
      { ...change, endDate: null },
      { ...change, ownerId: 'google:outsider' },
    ])
      assert.equal((await post(route, operation, invalid)).status, 400, operation)
    const response = await post(route, operation, change)
    assert.equal(response.status, 200, operation)
    assert.equal((await response.json()).schedules[0][field], saved[field as keyof typeof saved])
    for (const value of malformed) {
      globalThis.fetch = async () =>
        Response.json({ schedules: [{ ...schedule, ...saved, [field]: value }] })
      assert.equal((await post(route, operation, change)).status, 503, `${operation} ${value}`)
    }
  }
})

test('Unscheduled dose HTTP boundary sends the session owner, decodes receipts and includes reads', async () => {
  const input = {
    actionId: '10000000-0000-4000-8000-000000000001',
    medicineId: '10000000-0000-4000-8000-000000000002',
    takenAt: '2026-11-03T11:10:00.000Z',
    quantity: 0.5,
  }
  const saved = { ...input, id: input.actionId, outcome: 'Taken', revision: 0, removed: false }
  globalThis.fetch = async (_url, options) => {
    assert.deepEqual(JSON.parse(options!.body as string), {
      operation: 'saveUnscheduled',
      ownerId: 'google:test',
      dose: input,
    })
    return Response.json({ unscheduledDoses: [saved] })
  }
  assert.equal(
    (await post(unscheduledPost, 'unscheduled', { ...input, quantity: 0.25 })).status,
    400,
  )
  const response = await post(unscheduledPost, 'unscheduled', {
    ...input,
    ownerId: 'google:outsider',
  })
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { dose: saved })
  const change = {
    actionId: '10000000-0000-4000-8000-000000000003',
    doseId: saved.id,
    expectedRevision: 0,
    removed: true,
  }
  globalThis.fetch = async (_url, options) => {
    assert.deepEqual(JSON.parse(options!.body as string), {
      operation: 'changeUnscheduled',
      ownerId: 'google:test',
      change,
    })
    return Response.json({
      unscheduledDoses: [{ ...saved, actionId: change.actionId, revision: 1, removed: true }],
    })
  }
  assert.equal((await post(unscheduledPatch, 'unscheduled', change, 'PATCH')).status, 200)
  for (const unscheduledDoses of [null, [{}], [{ ...saved, outcome: 'Skipped' }]]) {
    globalThis.fetch = async () => Response.json({ unscheduledDoses })
    assert.equal((await post(unscheduledPost, 'unscheduled', input)).status, 503)
  }
  globalThis.fetch = async () =>
    Response.json({ schedules: [], records: [], unscheduledDoses: [saved] })
  const history = await historyGet(
    new Request('https://meddies.test/api/schedules/history?date=2026-11-03'),
  )
  assert.equal(history.status, 200)
  assert.deepEqual(await history.json(), { doses: [], unscheduledDoses: [saved] })
  globalThis.fetch = async () => Response.json({ schedules: [], records: [] })
  assert.deepEqual(
    await scheduleSend({ operation: 'listOutcomes', ownerId: 'google:test', date: '2026-11-03' }),
    { schedules: [], records: [], unscheduledDoses: [] },
  )
})
