import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { drizzle } from 'drizzle-orm/d1'
import { saveDeviceRegistration } from '../worker/device-registrations'
import { afterEach, beforeAll, test, vi } from 'vitest'
import { createWorker } from '../worker/index'
import {
  medicine,
  runtime,
  secret,
  startWorkerRuntime,
  versionFixture,
} from './helpers/medicine-storage-runtime'

startWorkerRuntime()
let db: D1Database
beforeAll(async () => {
  db = await runtime.getD1Database('DB')
})
afterEach(() => vi.restoreAllMocks())
const env = () => ({ DB: db, MEDICINES_WORKER_SECRET: secret, SCHEDULER_SECRET: secret })
const request = (path: string, body: unknown, authorization = secret) =>
  new Request(`http://worker${path}`, {
    method: 'POST',
    headers: { authorization: `Bearer ${authorization}` },
    body: JSON.stringify(body),
  })
function events() {
  const log = vi.spyOn(console, 'log').mockImplementation(() => {})
  return () => log.mock.calls.map(([event]) => event as Record<string, unknown>)
}
function duration(event: Record<string, unknown>) {
  assert.equal(typeof event.durationMs, 'number')
  assert.ok(Number.isFinite(event.durationMs) && Number(event.durationMs) >= 0)
  const { durationMs: _, ...fields } = event
  return fields
}

test('saved and refused commands each log one result with validated command identity', async () => {
  const captured = events()
  const worker = createWorker()
  const body = { operation: 'save', ownerId: 'google:logging', medicine }
  assert.equal((await worker.fetch(request('/medicines', body), env())).status, 200)
  assert.equal(
    (
      await worker.fetch(
        request('/medicines', { ...body, medicine: { ...medicine, label: 'Changed' } }),
        env(),
      )
    ).status,
    409,
  )
  assert.deepEqual(captured().map(duration), [
    {
      kind: 'command',
      path: '/medicines',
      operation: 'save',
      status: 200,
      cause: null,
      errorCode: null,
    },
    {
      kind: 'command',
      path: '/medicines',
      operation: 'save',
      status: 409,
      cause: null,
      errorCode: 'conflict',
    },
  ])
})

test('cron and scheduler commands log one run outcome, counts and duration even on failure', async () => {
  for (const date of ['2035-01-01', '2035-01-02']) {
    const fixture = await versionFixture()
    fixture.setNow(`${date}T00:00:00Z`)
    await fixture.operations.save({
      id: randomUUID(),
      medicineId: fixture.medicineId,
      startDate: date,
      endDate: date,
      times: [{ time: '09:00', quantity: 1 }],
    })
    await saveDeviceRegistration(
      drizzle(db),
      fixture.ownerId,
      {
        installationId: 'c' + randomUUID().replaceAll('-', '').slice(0, 21),
        token: `synthetic-device-token-${date}-at-least-32-characters`,
      },
      new Date(`${date}T00:00:00Z`),
    )
  }
  const captured = events()
  let now = '2035-01-01T06:00:00Z'
  const ready = createWorker(
    () => new Date(now),
    () => ({
      submit: async () => ({ outcome: 'accepted' }),
    }),
  )
  for (const origin of ['cron', 'command']) {
    now = origin === 'cron' ? '2035-01-01T06:00:00Z' : '2035-01-02T06:00:00Z'
    if (origin === 'cron') await ready.scheduled(undefined, env())
    else assert.equal((await ready.fetch(request('/due-reminders', {}), env())).status, 200)
    const failed = createWorker()
    if (origin === 'cron')
      await assert.rejects(failed.scheduled(undefined, env()), { message: 'unavailable' })
    else assert.equal((await failed.fetch(request('/due-reminders', {}), env())).status, 503)
  }
  assert.deepEqual(
    captured()
      .filter((event) => event.kind === 'scheduler')
      .map(duration),
    [
      {
        kind: 'scheduler',
        origin: 'cron',
        status: 'completed',
        cause: null,
        errorCode: null,
        submitted: 1,
        dropped: 0,
        retrying: 0,
      },
      {
        kind: 'scheduler',
        origin: 'cron',
        status: 'failed',
        cause: null,
        errorCode: 'unavailable',
        submitted: null,
        dropped: null,
        retrying: null,
      },
      {
        kind: 'scheduler',
        origin: 'command',
        status: 'completed',
        cause: null,
        errorCode: null,
        submitted: 1,
        dropped: 0,
        retrying: 0,
      },
      {
        kind: 'scheduler',
        origin: 'command',
        status: 'failed',
        cause: null,
        errorCode: 'unavailable',
        submitted: null,
        dropped: null,
        retrying: null,
      },
    ],
  )
  assert.equal((await ready.fetch(request('/due-reminders', {}, 'refused'), env())).status, 401)
  assert.deepEqual(
    captured()
      .filter((event) => event.kind === 'command')
      .map(duration),
    [
      {
        kind: 'command',
        path: '/due-reminders',
        operation: 'run',
        status: 200,
        cause: null,
        errorCode: null,
      },
      {
        kind: 'command',
        path: '/due-reminders',
        operation: 'run',
        status: 503,
        cause: null,
        errorCode: 'unavailable',
      },
      {
        kind: 'command',
        path: '/due-reminders',
        operation: 'run',
        status: 401,
        cause: null,
        errorCode: 'unauthorized',
      },
    ],
  )
  assert.equal(captured().filter((event) => event.kind === 'scheduler').length, 4)
})

test('logs exclude seeded personal data, credentials, arbitrary paths and storage or provider messages', async () => {
  const captured = events()
  const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
  const privateValues = [
    'google:private-owner',
    'Private Medicine',
    'private-device-token-with-at-least-32-characters',
    'private-credential',
    'SELECT private SQL',
    'private-provider-text',
  ]
  const [ownerId, label, token, credential, sql, providerText] = privateValues
  const worker = createWorker()
  assert.equal(
    (
      await worker.fetch(
        request('/medicines', { operation: 'save', ownerId, medicine: { ...medicine, label } }),
        env(),
      )
    ).status,
    200,
  )
  assert.equal(
    (
      await worker.fetch(
        request('/device-registrations', {
          operation: 'save',
          ownerId,
          registration: { installationId: 'c' + 'a'.repeat(21), token },
        }),
        env(),
      )
    ).status,
    200,
  )
  await worker.fetch(request('/medicines', { operation: credential, ownerId }, credential), env())
  await worker.fetch(request(`/${token}?secret=${credential}`, {}), env())
  await worker.fetch(request('/medicines', { operation: token, ownerId }), env())
  const broken = {
    ...env(),
    DB: {
      prepare() {
        throw new Error(`D1_ERROR: ${sql}`)
      },
    } as unknown as D1Database,
  }
  assert.equal(
    (await worker.fetch(request('/medicines', { operation: 'list', ownerId }), broken)).status,
    503,
  )
  // Exercise a real asynchronous D1 error wrapped by Drizzle, as well as prepare failure.
  const queryFailure = {
    ...env(),
    DB: {
      prepare() {
        return db.prepare('SELECT * FROM missing_logging_table WHERE owner_id = ?')
      },
    } as unknown as D1Database,
  }
  assert.equal(
    (await worker.fetch(request('/medicines', { operation: 'list', ownerId }), queryFailure))
      .status,
    503,
  )
  const storageScheduler = createWorker(undefined, () => ({
    submit: async () => ({ outcome: 'accepted' }),
  }))
  await assert.rejects(storageScheduler.scheduled(undefined, broken), { message: 'internal' })
  await storageScheduler.fetch(request('/due-reminders', {}), broken)
  const unexpected = createWorker(() => {
    throw new Error(providerText)
  })
  await unexpected.fetch(request('/medicines', { operation: 'save', ownerId, medicine }), env())
  const scheduler = createWorker(undefined, () => {
    throw new Error(providerText)
  })
  await assert.rejects(scheduler.scheduled(undefined, env()), { message: 'internal' })
  await scheduler.fetch(request('/due-reminders', {}), env())
  const logged = captured()
  assert.equal(logged.length, 14)
  assert.deepEqual(
    logged
      .filter((event) => event.errorCode === 'internal')
      .map((event) => [event.kind, event.cause]),
    [
      ['command', 'storage'],
      ['command', 'storage'],
      ['scheduler', 'storage'],
      ['scheduler', 'storage'],
      ['command', 'storage'],
      ['command', 'unexpected'],
      ['scheduler', 'unexpected'],
      ['scheduler', 'unexpected'],
      ['command', 'unexpected'],
    ],
  )
  for (const value of privateValues) assert.ok(!JSON.stringify(logged).includes(value), value)
  assert.deepEqual(errors.mock.calls, [])
  for (const event of logged) {
    assert.ok([null, 'storage', 'unexpected'].includes(event.cause as string | null))
    assert.deepEqual(
      Object.keys(event).sort(),
      event.kind === 'command'
        ? ['cause', 'durationMs', 'errorCode', 'kind', 'operation', 'path', 'status']
        : [
            'cause',
            'dropped',
            'durationMs',
            'errorCode',
            'kind',
            'origin',
            'retrying',
            'status',
            'submitted',
          ],
    )
  }
})

test('Workers Logs persist every structured event while invocation logs stay off', () => {
  const config = readFileSync('worker/wrangler.jsonc', 'utf8')
  // Wrangler's JSONC uses trailing commas; there are no comments in this config.
  const { observability } = JSON.parse(config.replace(/,\s*([}\]])/g, '$1'))
  assert.equal(observability.enabled, true)
  assert.deepEqual(observability.logs, {
    enabled: true,
    head_sampling_rate: 1,
    invocation_logs: false,
    persist: true,
  })
})
