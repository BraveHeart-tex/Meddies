import { once } from 'node:events'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { performance } from 'node:perf_hooks'
import { setTimeout as delay } from 'node:timers/promises'

/** One Worker request from Next.js, as the journey fixture saw it. Times are monotonic ms. */
export type WorkerRequest = {
  method: string
  path: string
  /** The command's `operation`, when the body carries one. */
  operation?: string
  start: number
  /** When the response finished; unset while held or in flight. */
  end?: number
  status?: number
}

/**
 * Matches Worker requests by HTTP method and path prefix, and optionally the command's
 * `operation`. History reads are `{ method: 'POST', path: '/schedules', operation: 'listOutcomes' }`
 * and `{ method: 'POST', path: '/medicines', operation: 'list' }`.
 */
export type WorkerRoute = { method: string; path: string; operation?: string }

export type WorkerControls = {
  /** Hold matching responses to Next.js until `release`. The Worker still runs the request. */
  hold(route: WorkerRoute): void
  /**
   * Send held responses that match `route` (all when omitted), and drop hold rules it covers,
   * so later matching requests pass.
   */
  release(route?: WorkerRoute): void
  /** Answer matching requests with `status`, without reaching the Worker. */
  fail(route: WorkerRoute, status: number): void
  /** Delay matching responses by a fixed time, for the cases that need one. Prefer `hold`. */
  delay(route: WorkerRoute, ms: number): void
  /** Drop every rule and send every held response. */
  clear(): void
  /** Count responses currently held, optionally only those matching `route`. */
  held(route?: WorkerRoute): number
  /** The timing log, optionally only entries matching `route`. */
  requests(route?: WorkerRoute): WorkerRequest[]
}

export type WorkerProxy = WorkerControls & {
  url: URL
  close(): Promise<void>
}

type Rule = {
  route: WorkerRoute
  action: { kind: 'hold' } | { kind: 'fail'; status: number } | { kind: 'delay'; ms: number }
}

/** Overlapping reads: every one started before any finished (held reads have not finished). */
export function overlapped(requests: Pick<WorkerRequest, 'start' | 'end'>[]) {
  if (requests.length < 2) return false
  const lastStart = Math.max(...requests.map((request) => request.start))
  return requests.every((request) => request.end === undefined || request.end > lastStart)
}

const matches = (route: WorkerRoute, request: WorkerRoute) =>
  route.method.toUpperCase() === request.method.toUpperCase() &&
  request.path.startsWith(route.path) &&
  (route.operation === undefined || route.operation === request.operation)

const sameRoute = (a: WorkerRoute, b: WorkerRoute) =>
  a.method.toUpperCase() === b.method.toUpperCase() &&
  a.path === b.path &&
  a.operation === b.operation

const hopHeaders = new Set([
  'connection',
  'content-length',
  'content-encoding',
  'host',
  'keep-alive',
  'transfer-encoding',
])

const forwardable = (headers: Headers | IncomingMessage['headers']) => {
  const entries = headers instanceof Headers ? [...headers.entries()] : Object.entries(headers)
  return Object.fromEntries(
    entries.filter(
      (entry): entry is [string, string] =>
        typeof entry[1] === 'string' && !hopHeaders.has(entry[0].toLowerCase()),
    ),
  )
}

function operationOf(body: Buffer) {
  try {
    const operation = JSON.parse(body.toString()).operation
    return typeof operation === 'string' ? operation : undefined
  } catch {
    return undefined
  }
}

/**
 * A Node proxy in front of the journey Worker. Next.js talks to it instead of Miniflare, so a
 * journey can see and control the server's Worker reads, which `page.route` cannot reach.
 */
export async function startWorkerProxy(
  target: URL,
  { onError }: { onError?: (line: string) => void } = {},
): Promise<WorkerProxy> {
  const log: WorkerRequest[] = []
  let rules: Rule[] = []
  const held = new Map<WorkerRequest, () => void>()

  const setRule = (rule: Rule) => {
    rules = [...rules.filter((other) => !sameRoute(other.route, rule.route)), rule]
  }
  // The newest matching rule wins.
  const ruleFor = (entry: WorkerRequest) => rules.findLast((rule) => matches(rule.route, entry))

  const failWith = (response: ServerResponse, status: number) => {
    response.writeHead(status, { 'content-type': 'application/json' })
    response.end(JSON.stringify({ error: 'journey_failure' }))
  }

  async function handle(request: IncomingMessage, response: ServerResponse, entry: WorkerRequest) {
    const chunks: Buffer[] = []
    for await (const chunk of request) chunks.push(chunk as Buffer)
    const body = Buffer.concat(chunks)
    entry.operation = operationOf(body)
    log.push(entry)
    // Next.js can abandon a request, for example when the browser navigates away.
    response.on('close', () => {
      entry.end ??= performance.now()
      held.get(entry)?.()
      held.delete(entry)
    })
    const first = ruleFor(entry)?.action
    if (first?.kind === 'fail') return failWith(response, (entry.status = first.status))
    const upstream = await fetch(new URL(entry.path, target), {
      method: entry.method,
      headers: forwardable(request.headers),
      body: body.length ? body : undefined,
    })
    const payload = Buffer.from(await upstream.arrayBuffer())
    // Rules can change while the Worker runs or the response is held, so read them again.
    const action = ruleFor(entry)?.action
    if (action?.kind === 'hold') await new Promise<void>((resume) => held.set(entry, resume))
    if (action?.kind === 'delay') await delay(action.ms)
    if (response.destroyed) return
    const last = ruleFor(entry)?.action
    if (last?.kind === 'fail') return failWith(response, (entry.status = last.status))
    entry.status = upstream.status
    response.writeHead(upstream.status, forwardable(upstream.headers))
    response.end(payload)
  }

  const server = createServer((request, response) => {
    const entry: WorkerRequest = {
      method: request.method ?? 'GET',
      path: new URL(request.url ?? '/', target).pathname,
      start: performance.now(),
    }
    handle(request, response, entry).catch((error: unknown) => {
      onError?.(`worker proxy: ${entry.method} ${entry.path} failed: ${String(error)}`)
      entry.status = 502
      if (!response.headersSent) response.writeHead(502)
      response.end()
    })
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const { port } = server.address() as AddressInfo

  const releaseHeld = (route?: WorkerRoute) => {
    for (const [entry, resume] of held)
      if (!route || matches(route, entry)) {
        held.delete(entry)
        resume()
      }
  }

  return {
    url: new URL(`http://127.0.0.1:${port}/`),
    hold: (route) => setRule({ route, action: { kind: 'hold' } }),
    release(route) {
      rules = rules.filter(
        (rule) => rule.action.kind !== 'hold' || (route && !matches(route, rule.route)),
      )
      releaseHeld(route)
    },
    fail: (route, status) => setRule({ route, action: { kind: 'fail', status } }),
    delay: (route, ms) => setRule({ route, action: { kind: 'delay', ms } }),
    clear() {
      rules = []
      releaseHeld()
    },
    held: (route) => [...held.keys()].filter((entry) => !route || matches(route, entry)).length,
    requests: (route) =>
      log.filter((entry) => !route || matches(route, entry)).map((entry) => ({ ...entry })),
    async close() {
      rules = []
      releaseHeld()
      server.closeAllConnections()
      server.close()
      await once(server, 'close')
    },
  }
}
