import { once } from 'node:events'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, beforeEach, expect, test } from 'vitest'
import { overlapped, startWorkerProxy, type WorkerProxy } from './browser/worker-proxy'

// A stand-in Worker: echoes the command's operation and counts calls.
let upstream: Server
let upstreamCalls: string[]
let proxy: WorkerProxy

beforeEach(async () => {
  upstreamCalls = []
  upstream = createServer(async (request, response) => {
    let body = ''
    for await (const chunk of request) body += chunk
    upstreamCalls.push(`${request.method} ${request.url} ${body}`)
    response.writeHead(200, { 'content-type': 'application/json' })
    response.end(JSON.stringify({ echoed: JSON.parse(body).operation }))
  })
  upstream.listen(0, '127.0.0.1')
  await once(upstream, 'listening')
  const { port } = upstream.address() as AddressInfo
  proxy = await startWorkerProxy(new URL(`http://127.0.0.1:${port}/`))
})

afterEach(async () => {
  await proxy.close()
  upstream.close()
})

const send = (path: string, operation: string) =>
  fetch(new URL(path, proxy.url), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ operation }),
  })

test('forwards requests unchanged and logs each one', async () => {
  const response = await send('/schedules', 'listOutcomes')
  expect(response.status).toBe(200)
  expect(await response.json()).toEqual({ echoed: 'listOutcomes' })
  expect(upstreamCalls).toEqual(['POST /schedules {"operation":"listOutcomes"}'])
  const [entry] = proxy.requests()
  expect(entry).toMatchObject({
    method: 'POST',
    path: '/schedules',
    operation: 'listOutcomes',
    status: 200,
  })
  expect(entry.end).toBeGreaterThanOrEqual(entry.start)
})

const settled = async (promise: Promise<unknown>) =>
  Promise.race([promise.then(() => true), new Promise((done) => setTimeout(done, 50, false))])

test('holds matching responses until released, then stops holding', async () => {
  proxy.hold({ method: 'POST', path: '/schedules', operation: 'listOutcomes' })
  const held = send('/schedules', 'listOutcomes')
  const other = send('/schedules', 'list')
  expect((await other).status).toBe(200)
  await expect.poll(() => proxy.held()).toBe(1)
  expect(await settled(held)).toBe(false)
  // The Worker already answered; only the response to Next.js waits.
  expect(upstreamCalls).toHaveLength(2)
  expect(proxy.requests().find((entry) => entry.operation === 'listOutcomes')?.end).toBeUndefined()

  proxy.release()
  expect((await held).status).toBe(200)
  expect(proxy.held()).toBe(0)
  expect((await send('/schedules', 'listOutcomes')).status).toBe(200)
})

test('releases one path and keeps holding the rest', async () => {
  proxy.hold({ method: 'POST', path: '/' })
  const schedules = send('/schedules', 'listOutcomes')
  const medicines = send('/medicines', 'list')
  await expect.poll(() => proxy.held()).toBe(2)

  proxy.release({ method: 'POST', path: '/medicines' })
  expect((await medicines).status).toBe(200)
  expect(await settled(schedules)).toBe(false)
  expect(proxy.held({ method: 'POST', path: '/schedules' })).toBe(1)

  proxy.release()
  expect((await schedules).status).toBe(200)
})

test('fails matching requests with a status without reaching the Worker', async () => {
  proxy.fail({ method: 'POST', path: '/schedules' }, 503)
  expect((await send('/schedules', 'listOutcomes')).status).toBe(503)
  expect((await send('/medicines', 'list')).status).toBe(200)
  expect(upstreamCalls).toEqual(['POST /medicines {"operation":"list"}'])
  expect(proxy.requests({ method: 'POST', path: '/schedules' })).toMatchObject([{ status: 503 }])

  proxy.clear()
  expect((await send('/schedules', 'listOutcomes')).status).toBe(200)
})

test('delays matching responses by a fixed time', async () => {
  proxy.delay({ method: 'POST', path: '/schedules' }, 80)
  const response = send('/schedules', 'listOutcomes')
  expect(await settled(response)).toBe(false)
  expect((await response).status).toBe(200)
})

test('reads overlap only when all started before any was released', () => {
  const read = (start: number, end?: number) => ({ method: 'POST', path: '/', start, end })
  expect(overlapped([read(0), read(5)])).toBe(true)
  expect(overlapped([read(0, 10), read(5, 12)])).toBe(true)
  expect(overlapped([read(0, 4), read(5, 12)])).toBe(false)
  expect(overlapped([read(0)])).toBe(false)
})

test('a request Next.js abandons while held stops counting as held', async () => {
  proxy.hold({ method: 'POST', path: '/schedules' })
  const abort = new AbortController()
  const abandoned = fetch(new URL('/schedules', proxy.url), {
    method: 'POST',
    body: JSON.stringify({ operation: 'listOutcomes' }),
    signal: abort.signal,
  }).catch(() => 'aborted')
  await expect.poll(() => proxy.held()).toBe(1)
  abort.abort()
  expect(await abandoned).toBe('aborted')
  await expect.poll(() => proxy.held()).toBe(0)
  expect(proxy.requests()[0].end).toBeDefined()
})

test('a failure set while the Worker runs replaces its response', async () => {
  proxy.hold({ method: 'POST', path: '/schedules' })
  const response = send('/schedules', 'listOutcomes')
  await expect.poll(() => proxy.held()).toBe(1)
  proxy.fail({ method: 'POST', path: '/schedules' }, 503)
  proxy.release()
  expect((await response).status).toBe(503)
})
