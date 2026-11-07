import assert from 'node:assert/strict'
import { test } from 'vitest'
import { json, mutationGuard, failure } from '../src/lib/http.ts'
import { readJsonRequest } from '../src/lib/json-request.ts'
import { ApplicationError } from '../src/lib/application-error.ts'

const request = (headers, body = '{}') =>
  new Request('https://meddies.test/api/schedules', {
    method: 'POST',
    headers,
    body,
  })
test('HTTP mutations preserve exact origin, content type and guard precedence', async () => {
  for (const [headers, status] of [
    [{}, 403],
    [{ origin: 'https://other.test', 'content-type': 'text/plain' }, 403],
    [{ origin: 'https://meddies.test' }, 415],
    [{ origin: 'https://meddies.test', 'content-type': 'Application/JSON' }, 415],
  ]) {
    const response = mutationGuard(request(headers))
    assert.equal(response.status, status)
    assert.equal(response.headers.get('cache-control'), 'no-store')
    assert.deepEqual(await response.json(), { error: status === 403 ? 'forbidden' : 'validation' })
  }
  assert.equal(
    mutationGuard(
      request({
        origin: 'https://meddies.test',
        'content-type': 'application/json; charset=utf-8',
      }),
    ),
    undefined,
  )
})
test('bounded JSON handles missing, malformed, split UTF-8 and exact byte limits', async () => {
  for (const body of [undefined, '', '{']) {
    await assert.rejects(
      () => readJsonRequest(new Request('https://meddies.test', { method: 'POST', body })),
      { code: 'validation', status: 400 },
    )
  }
  const exact = JSON.stringify('x'.repeat(4094))
  assert.equal((await readJsonRequest(request({}, exact))).length, 4094)
  await assert.rejects(() => readJsonRequest(request({}, JSON.stringify('é'.repeat(2048)))), {
    status: 413,
  })
  const bytes = new TextEncoder().encode('"é"')
  const stream = new ReadableStream({
    start(controller) {
      for (const byte of bytes) controller.enqueue(Uint8Array.of(byte))
      controller.close()
    },
  })
  assert.equal(
    await readJsonRequest(
      new Request('https://meddies.test', { method: 'POST', body: stream, duplex: 'half' }),
    ),
    'é',
  )
})
test('HTTP responses preserve domain errors, unavailable fallback and no-store', async () => {
  assert.equal(json({ ok: true }).headers.get('cache-control'), 'no-store')
  for (const [code, status] of [
    ['validation', 400],
    ['conflict', 409],
    ['unauthorized', 401],
    ['unavailable', 503],
  ]) {
    const response = failure(new ApplicationError(code, status), 'test_failure')
    assert.equal(response.status, status)
    assert.deepEqual(await response.json(), { error: code })
  }
  assert.equal(failure(new Error('private details'), 'test_failure').status, 503)
})

test('chunked oversized JSON cancels reading regardless of Content-Length', async () => {
  let cancelled = false
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('"' + 'x'.repeat(4095)))
      controller.enqueue(new TextEncoder().encode('x"'))
    },
    cancel() {
      cancelled = true
    },
  })
  await assert.rejects(
    () =>
      readJsonRequest(
        new Request('https://meddies.test', {
          method: 'POST',
          headers: { 'content-length': '2' },
          body: stream,
          duplex: 'half',
        }),
      ),
    { code: 'validation', status: 413 },
  )
  assert.equal(cancelled, true)
})
