import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { beforeAll, test, vi } from 'vitest'
import { createWorker } from '../worker/index'
import { GET, PUT, PATCH, DELETE } from '../src/app/api/device-registration/route'
import { startWorkerRuntime, runtime, secret } from './helpers/medicine-storage-runtime'
import { installSyntheticWorker } from './helpers/synthetic-worker'

// Device registrations on real D1, through the API routes, server wiring and Worker.
// The Worker runs in-process against Miniflare's D1 so its logs are captured too.
const session = vi.hoisted(() => ({ id: 'google:device-a' as string | null }))
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
let brokenDb = false
beforeAll(async () => {
  db = await runtime.getD1Database('DB')
  process.env.MEDICINES_WORKER_SECRET = secret
  const worker = createWorker(() => new Date('2026-11-16T10:00:00.000Z'))
  globalThis.fetch = async (url, init) =>
    worker.fetch(
      new Request(url as URL, { method: init!.method, headers: init!.headers, body: init!.body }),
      {
        DB: brokenDb ? ({} as D1Database) : db,
        MEDICINES_WORKER_SECRET: secret,
      },
    )
})

const installation = () => `d${randomBytes(16).toString('base64url').slice(0, 21)}`
const token = (installationId: string) =>
  `${installationId}:APA91b${randomBytes(105).toString('base64url')}`
const as = (ownerId: string | null) => {
  session.id = ownerId
}
const owner = () => `google:${randomBytes(8).toString('hex')}`

const origin = 'http://app.test'
const body = (method: string, value: unknown) =>
  new Request(`${origin}/api/device-registration`, {
    method,
    headers: { origin, 'content-type': 'application/json' },
    body: JSON.stringify(value),
  })
const responses: Response[] = []
const answer = async (response: Response) => {
  responses.push(response.clone())
  return { status: response.status, body: await response.json() }
}
const save = async (installationId: string, value: string) =>
  answer(await PUT(body('PUT', { installationId, token: value })))
const renew = async (installationId: string, value: string) =>
  answer(await PATCH(body('PATCH', { installationId, token: value })))
const remove = async (installationId: string) =>
  answer(await DELETE(body('DELETE', { installationId })))
const read = async (installationId: string) =>
  answer(
    await GET(new Request(`${origin}/api/device-registration?installationId=${installationId}`)),
  )
const rows = async (installationId: string) =>
  (
    await db
      .prepare(
        'SELECT owner_id AS ownerId, token FROM device_registrations WHERE installation_id=?',
      )
      .bind(installationId)
      .all<{ ownerId: string; token: string }>()
  ).results

test('Save creates one registration and a repeat save replaces its token', async () => {
  const ownerId = owner()
  const id = installation()
  as(ownerId)
  assert.deepEqual(await read(id), { status: 200, body: { registered: false } })
  const first = token(id)
  assert.deepEqual(await save(id, first), { status: 200, body: { registered: true } })
  assert.deepEqual(await rows(id), [{ ownerId, token: first }])
  assert.deepEqual(await read(id), { status: 200, body: { registered: true } })

  const second = token(id)
  assert.deepEqual(await save(id, second), { status: 200, body: { registered: true } })
  assert.deepEqual(await rows(id), [{ ownerId, token: second }])
})

test('Renew updates an existing registration and never recreates a removed one', async () => {
  const ownerId = owner()
  const id = installation()
  as(ownerId)
  assert.deepEqual(await renew(id, token(id)), { status: 200, body: { registered: false } })
  assert.deepEqual(await rows(id), [])

  await save(id, token(id))
  const renewed = token(id)
  assert.deepEqual(await renew(id, renewed), { status: 200, body: { registered: true } })
  assert.deepEqual(await rows(id), [{ ownerId, token: renewed }])

  await remove(id)
  assert.deepEqual(await renew(id, token(id)), { status: 200, body: { registered: false } })
  assert.deepEqual(await rows(id), [])
  assert.deepEqual(await read(id), { status: 200, body: { registered: false } })
})

test('Saving another account’s Device registration requires its current token to move it', async () => {
  const [a, b] = [owner(), owner()]
  const id = installation()
  as(a)
  const moved = token(id)
  await save(id, moved)
  const before = await db
    .prepare('SELECT * FROM device_registrations WHERE installation_id=?')
    .bind(id)
    .first()
  as(b)
  assert.deepEqual(await save(id, token(id)), { status: 200, body: { registered: false } })
  assert.deepEqual(
    await db.prepare('SELECT * FROM device_registrations WHERE installation_id=?').bind(id).first(),
    before,
  )
  assert.deepEqual(await read(id), { status: 200, body: { registered: false } })
  assert.deepEqual(await save(id, moved), { status: 200, body: { registered: true } })
  assert.deepEqual(await rows(id), [{ ownerId: b, token: moved }])
  assert.deepEqual(await read(id), { status: 200, body: { registered: true } })
  as(a)
  assert.deepEqual(await read(id), { status: 200, body: { registered: false } })
})

test('Remove deletes the registration and a repeat Remove still succeeds', async () => {
  as(owner())
  const id = installation()
  await save(id, token(id))
  assert.deepEqual(await remove(id), { status: 200, body: { registered: false } })
  assert.deepEqual(await rows(id), [])
  assert.deepEqual(await remove(id), { status: 200, body: { registered: false } })
  assert.deepEqual(await read(id), { status: 200, body: { registered: false } })
})

test('Another account cannot read, renew or remove the caller registration', async () => {
  const [a, b] = [owner(), owner()]
  const id = installation()
  const kept = token(id)
  as(a)
  await save(id, kept)
  as(b)
  assert.deepEqual(await read(id), { status: 200, body: { registered: false } })
  assert.deepEqual(await renew(id, token(id)), { status: 200, body: { registered: false } })
  assert.deepEqual(await remove(id), { status: 200, body: { registered: false } })
  assert.deepEqual(await rows(id), [{ ownerId: a, token: kept }])
  as(a)
  assert.deepEqual(await read(id), { status: 200, body: { registered: true } })
})

test('Malformed input returns 400 and no response, error body or log contains a token', async () => {
  const logged: unknown[][] = []
  const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((level) =>
    vi.spyOn(console, level).mockImplementation((...args) => void logged.push(args)),
  )
  try {
    responses.length = 0
    as(owner())
    const id = installation()
    const secretToken = token(id)
    const malformed = [
      ...['', 'abc', `a${id.slice(1)}`, `${id}x`, `${id.slice(0, 21)}=`].map((value) => [
        value,
        secretToken,
      ]),
      [id, `${secretToken} `],
      [id, 'short:token'],
      [id, `${secretToken}${'A'.repeat(1024)}`],
    ] as const
    for (const [installationId, value] of malformed) {
      assert.equal((await save(installationId, value)).status, 400)
      assert.equal((await renew(installationId, value)).status, 400)
    }
    for (const installationId of ['', 'abc', `${id}x`]) {
      assert.equal((await read(installationId)).status, 400)
      assert.equal((await remove(installationId)).status, 400)
    }
    await save(id, secretToken)
    await renew(id, secretToken)
    await read(id)
    as(null)
    assert.equal((await save(id, secretToken)).status, 401)
    as(owner())
    brokenDb = true
    try {
      assert.deepEqual(await save(id, secretToken), { status: 503, body: { error: 'unavailable' } })
    } finally {
      brokenDb = false
    }
    assert.ok(logged.length > 0, 'the storage failure is logged')
    const captured = [
      ...(await Promise.all(responses.map((response) => response.text()))),
      ...logged.map((args) => args.map((arg) => (arg instanceof Error ? arg.stack : String(arg)))),
    ].join('\n')
    assert.equal(responses.length, 27)
    assert.doesNotMatch(captured, /APA91b/)
    assert.equal(captured.includes(secretToken.slice(-40)), false)
  } finally {
    for (const spy of spies) spy.mockRestore()
  }
})
