import type { MedicineCommand } from '../src/features/medicines/contract'
import type { DoseRecord } from '../src/features/schedules/contract'
import assert from 'node:assert/strict'
import { afterEach, describe, test, vi } from 'vitest'
import { send as medicineSend } from '../src/features/medicines/server'
import { send as scheduleSend } from '../src/features/schedules/server'
import { PUT } from '../src/app/api/schedules/route'
import { PATCH as medicinePatch } from '../src/app/api/medicines/route'
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
  const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
  try {
    for (const [upstream, status, code] of [
      [400, 400, 'validation'],
      [409, 409, 'conflict'],
      [401, 503, 'unavailable'],
      [500, 503, 'unavailable'],
    ] as const) {
      globalThis.fetch = async () => new Response('{}', { status: upstream })
      await assert.rejects(() => medicineSend(list), { status, code })
      if (upstream === 401 || upstream === 500)
        assert.deepEqual(logged.mock.calls.at(-1), [
          { kind: 'medicine_gateway_failure', cause: 'http', status: upstream },
        ])
      else assert.equal(logged.mock.calls.length, 0)
    }
    for (const [error, cause] of [
      [new DOMException('private timeout detail', 'TimeoutError'), 'timeout'],
      [new TypeError('private network detail'), 'network'],
    ] as const) {
      globalThis.fetch = async () => {
        throw error
      }
      await assert.rejects(() => medicineSend(list), { status: 503 })
      assert.deepEqual(logged.mock.calls.at(-1), [
        { kind: 'medicine_gateway_failure', cause, status: null },
      ])
    }
    globalThis.fetch = async () => new Response('{')
    await assert.rejects(() => medicineSend(list), { status: 503 })
    assert.deepEqual(logged.mock.calls.at(-1), [
      { kind: 'medicine_gateway_failure', cause: 'response', status: null },
    ])
    globalThis.fetch = async () =>
      Object.assign(new Response('{}'), {
        json: async () => {
          throw new DOMException('private body timeout', 'TimeoutError')
        },
      })
    await assert.rejects(() => medicineSend(list), { status: 503 })
    assert.deepEqual(logged.mock.calls.at(-1), [
      { kind: 'medicine_gateway_failure', cause: 'timeout', status: null },
    ])
    assert.equal(logged.mock.calls.length, 6)
  } finally {
    logged.mockRestore()
  }
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
test('feature decoders answer unavailable for malformed medicine lists, actions and delete receipts', async () => {
  const action = {
    actionId: '10000000-0000-4000-8000-000000000001',
    medicineId: '10000000-0000-4000-8000-000000000002',
    expectedRevision: 0,
  }
  const commands: MedicineCommand[] = [
    list,
    { ...list, operation: 'archive', archive: action },
    { ...list, operation: 'restore', restore: action },
    { ...list, operation: 'stockOff', stock: action },
  ]
  for (const command of commands) {
    for (const payload of [null, [], {}, { medicines: null }, { medicines: [{ stock: {} }] }]) {
      globalThis.fetch = async () => Response.json(payload)
      await assert.rejects(() => medicineSend(command), { status: 503, code: 'unavailable' })
    }
  }
  for (const deletion of [null, {}, { ...action, deletedAt: 'invalid' }]) {
    globalThis.fetch = async () => Response.json({ deletion })
    await assert.rejects(() => medicineSend({ ...list, operation: 'delete', deletion: action }), {
      status: 503,
      code: 'unavailable',
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

test('Taken-only decoding retains strength snapshots while outcome decoding also preserves revision metadata', async () => {
  const record: DoseRecord = {
    scheduleId: '10000000-0000-4000-8000-000000000001',
    dueAt: '2026-11-06T06:00:00.000Z',
    takenAt: '2026-11-06T06:05:00.000Z',
    quantity: 1,
    outcome: 'Taken',
    revision: 2,
    actionId: '10000000-0000-4000-8000-000000000002',
    strengthRevisionId: '10000000-0000-4000-8000-000000000003',
    strength: '250 mg',
    medicineLabel: 'Earlier',
    unit: 'tablet',
  }
  globalThis.fetch = async () => Response.json({ schedules: [], records: [record] })
  const { revision, actionId, ...legacy } = record
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

test('restore HTTP operation parses its request and requires an explicit confirmed active receipt', async () => {
  setAuthenticated(true)
  const restore = {
    actionId: '10000000-0000-4000-8000-000000000001',
    medicineId: '10000000-0000-4000-8000-000000000002',
    expectedRevision: 1,
  }
  const record = {
    id: restore.medicineId,
    label: 'Example',
    strength: '200 mg',
    unit: 'tablet',
    revision: 2,
    lastActionId: restore.actionId,
    archivedAt: null,
    currentStrengthRevisionId: restore.medicineId,
    strengthRevisions: [
      {
        id: restore.medicineId,
        label: 'Example',
        strength: '200 mg',
        unit: 'tablet',
        effectiveAt: '0001-01-01T00:00:00.000Z',
        previousValues: [],
      },
    ],
    everHadSchedule: true,
    everHadDose: false,
    latestTakenAt: null,
  }
  const patch = (input: unknown) =>
    medicinePatch(
      new Request('https://meddies.test/api/medicines', {
        method: 'PATCH',
        headers: { origin: 'https://meddies.test', 'content-type': 'application/json' },
        body: JSON.stringify({ operation: 'restore', restore: input }),
      }),
    )
  globalThis.fetch = async (_, options) => {
    assert.deepEqual(JSON.parse(options!.body as string), {
      operation: 'restore',
      ownerId: 'google:test',
      restore,
    })
    return Response.json({ medicines: [record] })
  }
  const saved = await patch({ ...restore, ownerId: 'google:other' })
  assert.equal(saved.status, 200)
  assert.deepEqual(await saved.json(), { medicines: [{ ...record, stock: { tracked: false } }] })
  for (const invalid of [
    null,
    { ...restore, actionId: 'bad' },
    { ...restore, expectedRevision: -1 },
  ]) {
    globalThis.fetch = async () => assert.fail('invalid restore reached storage')
    assert.equal((await patch(invalid)).status, 400)
  }
  for (const rows of [
    [],
    [record, record],
    [{ ...record, revision: 1 }],
    [{ ...record, lastActionId: restore.medicineId }],
    [{ ...record, id: restore.actionId }],
    [{ ...record, archivedAt: '2026-11-03T09:00:00.000Z' }],
    [{ ...record, archivedAt: undefined }],
  ]) {
    globalThis.fetch = async () => Response.json({ medicines: rows })
    assert.equal((await patch(restore)).status, 503)
  }
})

test('stock HTTP commands authenticate, use the session owner and require explicit stock receipts', async () => {
  const stock = {
    actionId: '10000000-0000-4000-8000-000000000001',
    medicineId: '10000000-0000-4000-8000-000000000002',
    expectedRevision: 0,
    unit: 'tablet',
    startingCount: 12.5,
  }
  const record = {
    id: stock.medicineId,
    label: 'Example',
    strength: null,
    unit: 'tablet',
    revision: 1,
    lastActionId: stock.actionId,
    archivedAt: null,
    currentStrengthRevisionId: stock.medicineId,
    strengthRevisions: [
      {
        id: stock.medicineId,
        label: 'Example',
        strength: null,
        unit: 'tablet',
        effectiveAt: '0001-01-01T00:00:00.000Z',
        previousValues: [],
      },
    ],
    everHadSchedule: false,
    everHadDose: false,
    latestTakenAt: null,
  }
  for (const operation of ['stockOn', 'stockOff'] as const) {
    const input =
      operation === 'stockOn'
        ? stock
        : { actionId: stock.actionId, medicineId: stock.medicineId, expectedRevision: 0 }
    const patch = () =>
      medicinePatch(
        new Request('https://meddies.test/api/medicines', {
          method: 'PATCH',
          headers: { origin: 'https://meddies.test', 'content-type': 'application/json' },
          body: JSON.stringify({ operation, stock: { ...input, ownerId: 'google:other' } }),
        }),
      )
    setAuthenticated(false)
    globalThis.fetch = async () => assert.fail('signed-out stock command reached storage')
    assert.equal((await patch()).status, 401)
    setAuthenticated(true)
    globalThis.fetch = async (_, options) => {
      assert.deepEqual(JSON.parse(options!.body as string), {
        operation,
        ownerId: 'google:test',
        stock: input,
      })
      return Response.json({
        medicines: [
          {
            ...record,
            stock: operation === 'stockOn' ? { tracked: true, count: 12.5 } : { tracked: false },
          },
        ],
      })
    }
    assert.equal((await patch()).status, 200)
    globalThis.fetch = async () => Response.json({ medicines: [record] })
    assert.equal((await patch()).status, 503)
  }
})

describe('Access service credentials', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })
  function configure() {
    vi.stubEnv('VERCEL_ENV', 'production')
    vi.stubEnv('MEDICINES_WORKER_URL', 'https://api.meddies.borakaraca.dev')
    vi.stubEnv('MEDICINES_WORKER_SECRET', 'synthetic-worker-bearer')
    vi.stubEnv('WORKER_ACCESS_CLIENT_ID', 'synthetic-access-id')
    vi.stubEnv('WORKER_ACCESS_CLIENT_SECRET', 'synthetic-access-secret')
  }

  test('the gateway sends server Access credentials alongside the existing bearer without redirects', async () => {
    configure()
    const command = { operation: 'list' as const, ownerId: 'google:synthetic' }
    const fetch = vi.fn(async (url: URL | RequestInfo, options?: RequestInit) => {
      const headers = new Headers(options?.headers)
      assert.equal(new URL(String(url)).origin, 'https://api.meddies.borakaraca.dev')
      assert.equal(headers.get('CF-Access-Client-Id'), 'synthetic-access-id')
      assert.equal(headers.get('CF-Access-Client-Secret'), 'synthetic-access-secret')
      assert.equal(headers.get('Authorization'), 'Bearer synthetic-worker-bearer')
      assert.equal(options?.redirect, 'error')
      assert.equal(options?.cache, 'no-store')
      assert.deepEqual(JSON.parse(options?.body as string), command)
      return Response.json({ medicines: [] })
    })
    vi.stubGlobal('fetch', fetch)
    assert.deepEqual(await medicineSend(command), [])
    assert.equal(fetch.mock.calls.length, 1)
  })

  test('missing or partial production Access credentials stop before any network call and stay out of logs', async () => {
    configure()
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    for (const [id, secret] of [
      ['', ''],
      ['synthetic-access-id', ''],
      ['', 'synthetic-access-secret'],
    ]) {
      vi.stubEnv('WORKER_ACCESS_CLIENT_ID', id)
      vi.stubEnv('WORKER_ACCESS_CLIENT_SECRET', secret)
      await assert.rejects(medicineSend({ operation: 'list', ownerId: 'google:synthetic' }), {
        code: 'unavailable',
        status: 503,
      })
    }
    assert.equal(fetch.mock.calls.length, 0)
    assert.doesNotMatch(JSON.stringify(log.mock.calls), /synthetic-access/)
  })

  test('local Worker development omits Access credentials even when inherited from the shell', async () => {
    configure()
    vi.stubEnv('VERCEL_ENV', '')
    vi.stubEnv('WORKER_ACCESS_CLIENT_SECRET', '')
    const fetch = vi.fn(async (_url: URL | RequestInfo, options?: RequestInit) => {
      const headers = new Headers(options?.headers)
      assert.equal(headers.get('CF-Access-Client-Id'), null)
      assert.equal(headers.get('CF-Access-Client-Secret'), null)
      assert.equal(headers.get('Authorization'), 'Bearer synthetic-worker-bearer')
      return Response.json({ medicines: [] })
    })
    vi.stubGlobal('fetch', fetch)
    for (const url of ['http://localhost:8787', 'http://127.0.0.1:8787']) {
      vi.stubEnv('MEDICINES_WORKER_URL', url)
      assert.deepEqual(await medicineSend({ operation: 'list', ownerId: 'google:synthetic' }), [])
    }
    assert.equal(fetch.mock.calls.length, 2)
  })
})
