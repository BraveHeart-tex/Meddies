import assert from 'node:assert/strict'
import { test } from 'vitest'
import { createWorker } from '../worker/index'

const secret = 'synthetic-worker-secret-at-least-32-characters'
const worker = createWorker()
const request = (body: BodyInit | undefined, options: RequestInit & { duplex?: 'half' } = {}) =>
  new Request('http://worker/medicines', {
    method: 'POST',
    headers: { authorization: `Bearer ${secret}` },
    body,
    ...options,
  })
// No database operation is reached in these validation cases.
const env = { DB: {} as unknown as D1Database, MEDICINES_WORKER_SECRET: secret }
async function failure(
  req: Request,
  status: number,
  error: string,
  bindings: { DB: D1Database; MEDICINES_WORKER_SECRET?: string } = env,
) {
  // Missing capability is deliberately passed to the runtime guard.
  const response = await worker.fetch(req, bindings as Parameters<typeof worker.fetch>[1])
  assert.equal(response.status, status)
  assert.equal(response.headers.get('cache-control'), 'no-store')
  assert.deepEqual(await response.json(), { error })
}

test('Worker capability and routing precede JSON and owner validation', async () => {
  for (const configured of [undefined, '', 'short'])
    await failure(request('{'), 503, 'unavailable', {
      ...env,
      MEDICINES_WORKER_SECRET: configured,
    })
  await failure(request('{', { headers: {} }), 401, 'unauthorized')
  for (const authorization of ['', 'Bearer short', `Bearer ${secret}x`])
    await failure(request('{', { headers: { authorization } }), 401, 'unauthorized')
  await failure(request(undefined, { method: 'GET' }), 404, 'not_found')
  await failure(
    new Request('http://worker/unknown', {
      method: 'POST',
      headers: { authorization: `Bearer ${secret}` },
      body: '{',
    }),
    404,
    'not_found',
  )
})

test('Worker rejects invalid owner, unsupported commands and invalid list dates', async () => {
  for (const body of [
    null,
    [],
    {},
    { ownerId: 'other:a' },
    { ownerId: 'google:' },
    { ownerId: `google:${'a'.repeat(249)}` },
  ])
    await failure(request(JSON.stringify(body)), 400, 'validation')
  for (const path of ['/medicines', '/schedules']) {
    for (const command of [
      { operation: 'unsupported' },
      { operation: 'list', date: 'not-a-date' },
      { operation: 'listOutcomes' },
    ]) {
      if (path === '/medicines' && command.operation === 'list') continue
      await failure(
        new Request(`http://worker${path}`, {
          method: 'POST',
          headers: { authorization: `Bearer ${secret}` },
          body: JSON.stringify({ ...command, ownerId: 'google:http' }),
        }),
        400,
        'validation',
      )
    }
  }
})

test('Worker bounds streamed UTF-8 input at 4096 bytes regardless of content length', async () => {
  await failure(request(undefined), 400, 'validation')
  await failure(request('{'), 400, 'validation')
  const body = JSON.stringify({ ownerId: 'invalid', padding: 'é'.repeat(2000) })
  const exact = body + ' '.repeat(4096 - Buffer.byteLength(body))
  await failure(request(exact), 400, 'validation')
  await failure(request(exact + ' '), 413, 'validation')
  let cancelled = false
  let index = 0
  const stream = new ReadableStream({
    pull(controller) {
      controller.enqueue(new TextEncoder().encode(index++ ? 'x'.repeat(4096) : '{'))
    },
    cancel() {
      cancelled = true
    },
  })
  await failure(
    request(stream, {
      duplex: 'half',
      headers: { authorization: `Bearer ${secret}`, 'content-length': '1' },
    }),
    413,
    'validation',
  )
  assert.equal(cancelled, true)
})

test('Worker hides unexpected persistence errors behind unavailable and no-store', async () => {
  const originalError = console.error
  const logged: unknown[][] = []
  console.error = (...args) => logged.push(args)
  try {
    await failure(
      request(JSON.stringify({ operation: 'list', ownerId: 'google:http' })),
      503,
      'unavailable',
      {
        ...env,
        // This stub must throw before a statement can be used.
        DB: {
          prepare() {
            throw new Error('private database detail')
          },
        } as unknown as D1Database,
      },
    )
    assert.deepEqual(logged, [['medicine_storage_failure']])
  } finally {
    console.error = originalError
  }
})
