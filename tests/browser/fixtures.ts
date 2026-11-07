import { randomBytes } from 'node:crypto'
import { spawn, type ChildProcess } from 'node:child_process'
import { once } from 'node:events'
import { readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { createServer, type AddressInfo } from 'node:net'
import { resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { test as base, type APIResponse, type BrowserContext } from '@playwright/test'
import { Miniflare, convertV4MiniflareOptions } from 'miniflare'
import { encode } from 'next-auth/jwt'
import { startWorkerProxy, type WorkerControls, type WorkerProxy } from './worker-proxy'

export { expect } from '@playwright/test'

export type JourneyDatabase = Awaited<ReturnType<Miniflare['getD1Database']>>

export type Journey = {
  /** Sign in with a synthetic Auth.js session. No Google provider is used. */
  auth: boolean
  /** Start a local Worker with a fresh Miniflare D1 database. */
  storage: boolean
  /** Freeze the scheduling clock at this instant; move it with `app.setScheduleTime`. */
  initialScheduleTime?: string
  /** Seed the fresh database before Next.js starts. Requires `storage`. */
  seed?: (fixture: { db: JourneyDatabase; ownerId: string }) => Promise<unknown>
}

type Server = {
  origin: string
  token?: { secret: string; value: string; expires: number }
  setScheduleTime(instant: string): Promise<void>
  worker?: WorkerControls
}

export type App = {
  origin: string
  /** Move the frozen scheduling clock seen by Next.js and the Worker. */
  setScheduleTime(instant: string): Promise<void>
  /** Replace the browser session cookie with an expired one. */
  expireSession(): Promise<void>
  /** Call the app API as the signed-in user; fails unless the response is 200. */
  api(method: string, path: string, data: object): Promise<APIResponse>
  /**
   * Hold, release, fail or delay the server's Worker requests and read their timing log.
   * Requires `storage`. Seeding and the readiness check run before a journey can set rules.
   */
  worker: WorkerControls
}

export const ownerId = 'google:browser-journey'
const email = 'approved@example.test'
const cookieName = 'authjs.session-token'

const sessionToken = (secret: string, deadline: number) =>
  encode({
    secret,
    salt: cookieName,
    token: { sub: ownerId, email, version: '1', deadline },
    maxAge: 900,
  })

const sessionCookie = (value: string, expires: number) => ({
  name: cookieName,
  value,
  domain: 'localhost',
  path: '/',
  expires,
  httpOnly: true,
  secure: false,
  sameSite: 'Lax' as const,
})

async function freePort() {
  const probe = createServer()
  probe.listen(0, '127.0.0.1')
  await once(probe, 'listening')
  const { port } = probe.address() as AddressInfo
  await new Promise((done) => probe.close(done))
  return port
}

async function stop(child: ChildProcess) {
  const alive = () => child.exitCode === null && child.signalCode === null
  if (!alive()) return
  child.kill('SIGTERM')
  await Promise.race([once(child, 'exit'), delay(3000)])
  if (!alive()) return
  child.kill('SIGKILL')
  await Promise.race([once(child, 'exit'), delay(1000)])
}

function startWorker(clockFile: string | undefined, workerSecret: string) {
  const workerRoot = resolve('.worker-build')
  const workerScript = resolve(workerRoot, 'index.js')
  return new Miniflare(
    convertV4MiniflareOptions({
      ...(clockFile
        ? {
            modulesRoot: workerRoot,
            modules: [
              {
                type: 'ESModule',
                path: resolve(workerRoot, 'journey-entry.js'),
                contents: `
                  import { createWorker } from './index.js'
                  export default {
                    async fetch(request, env) {
                      const response = await env.JOURNEY_CLOCK.fetch('http://clock/')
                      const now = await response.text()
                      return createWorker(() => new Date(now)).fetch(request, env)
                    },
                  }
                `,
              },
              { type: 'ESModule', path: workerScript },
            ],
            serviceBindings: {
              JOURNEY_CLOCK: async () => new Response(await readFile(clockFile, 'utf8')),
            },
          }
        : { modules: true, scriptPath: workerScript }),
      compatibilityDate: '2026-11-03',
      host: '127.0.0.1',
      d1Databases: ['DB'],
      bindings: { MEDICINES_WORKER_SECRET: workerSecret },
    }),
  )
}

export const test = base.extend<{ journey: Journey; server: Server; app: App }>({
  journey: [{ auth: false, storage: false }, { option: true }],

  // Per-test Next.js server, fresh D1 database and scheduling-clock file.
  server: async ({ journey }, use, testInfo) => {
    const secret = randomBytes(32).toString('base64url')
    const workerSecret = randomBytes(32).toString('base64url')
    const clockFile = journey.initialScheduleTime
      ? testInfo.outputPath('scheduling-clock')
      : undefined
    const setScheduleTime = async (instant: string) => {
      if (!clockFile) throw new Error('Journey must declare initialScheduleTime')
      await writeFile(`${clockFile}.next`, new Date(instant).toISOString())
      await rename(`${clockFile}.next`, clockFile)
    }
    let worker: Miniflare | undefined
    let proxy: WorkerProxy | undefined
    let child: ChildProcess | undefined
    let logs = ''
    try {
      if (clockFile) await setScheduleTime(journey.initialScheduleTime!)
      if (journey.seed && !journey.storage) throw new Error('Journey seed requires storage')
      if (journey.storage) {
        worker = startWorker(clockFile, workerSecret)
        const db = await worker.getD1Database('DB')
        // Dynamic import: Playwright loads specs as CommonJS, and this helper uses import.meta.
        const { applyD1Migrations } = await import('../helpers/d1-migrations.mjs')
        await applyD1Migrations(db)
        await journey.seed?.({ db, ownerId })
      }
      // Next.js reaches the Worker through a proxy, so journeys can control server reads.
      if (worker)
        proxy = await startWorkerProxy(await worker.ready, {
          onError: (line) => (logs = `${logs}${line}\n`.slice(-8000)),
        })
      const port = await freePort()
      const origin = `http://localhost:${port}`
      const expires = Math.floor(Date.now() / 1000) + 900
      const token = journey.auth
        ? { secret, value: await sessionToken(secret, expires), expires }
        : undefined
      const env = Object.fromEntries(
        Object.entries(process.env).filter(
          ([key]) =>
            !key.startsWith('AUTH_') &&
            !['MEDICINES_WORKER_URL', 'MEDICINES_WORKER_SECRET'].includes(key),
        ),
      )
      // Dev mode writes to .next/dev, leaving the production build in .next usable.
      const { isBrowserDevMode } = await import('../helpers/journey-build.mjs')
      const dev = isBrowserDevMode(process.env)
      const next = spawn(
        process.execPath,
        [
          'node_modules/next/dist/bin/next',
          ...(dev ? ['dev', '--webpack'] : ['start']),
          ...['-H', '127.0.0.1', '-p', String(port)],
        ],
        {
          env: {
            ...env,
            NODE_ENV: dev ? 'development' : 'production',
            MEDDIES_BROWSER_CLOCK_FILE: clockFile ?? '',
            MEDICINES_WORKER_URL: proxy?.url.toString() ?? '',
            MEDICINES_WORKER_SECRET: worker ? workerSecret : '',
            AUTH_URL: origin,
            AUTH_SECRET: token ? secret : '',
            AUTH_GOOGLE_ID: token ? 'synthetic-client' : '',
            AUTH_GOOGLE_SECRET: token ? 'synthetic-secret' : '',
            AUTH_ALLOWED_EMAIL: token ? email : '',
            AUTH_SESSION_VERSION: token ? '1' : '',
          },
          stdio: ['ignore', 'pipe', 'pipe'],
        },
      )
      child = next
      const addLogs = (buffer: Buffer) => {
        logs = (logs + buffer.toString()).slice(-8000)
      }
      next.stdout.on('data', addLogs)
      next.stderr.on('data', addLogs)

      // Dev mode compiles /api/session on the first request.
      const readyBy = Date.now() + (dev ? 60_000 : 10_000)
      let ready = false
      while (!ready && Date.now() < readyBy) {
        if (next.exitCode !== null) throw new Error('Next.js exited during startup')
        try {
          const response = await fetch(`${origin}/api/session`, {
            headers: token ? { cookie: `${cookieName}=${token.value}` } : {},
          })
          ready = token
            ? response.ok && (await response.json()).id === ownerId
            : response.status === 401
        } catch {}
        if (!ready) await delay(100)
      }
      if (!ready) throw new Error('Next.js /api/session readiness check failed')

      // Journeys get the controls only, not the proxy's lifecycle.
      const { url: _url, close: _close, ...controls } = proxy ?? {}
      await use({ origin, token, setScheduleTime, worker: proxy && (controls as WorkerControls) })
    } finally {
      if (logs && testInfo.status !== testInfo.expectedStatus)
        await testInfo.attach('service.log', {
          body: logs.replaceAll(secret, '[redacted]').replaceAll(workerSecret, '[redacted]'),
          contentType: 'text/plain',
        })
      if (child) await stop(child)
      await proxy?.close()
      await worker?.dispose()
      if (clockFile) await unlink(clockFile).catch(() => {})
    }
  },

  baseURL: async ({ server }, use) => use(server.origin),

  context: async ({ context, server }, use) => {
    if (server.token)
      await context.addCookies([sessionCookie(server.token.value, server.token.expires)])
    await use(context)
  },

  app: async ({ server, context }, use) => {
    await use({
      origin: server.origin,
      setScheduleTime: server.setScheduleTime,
      expireSession: () => expireSession(context, server),
      get worker() {
        if (!server.worker) throw new Error('Journey must declare storage to control the Worker')
        return server.worker
      },
      api: async (method, path, data) => {
        // context.request shares the browser's session cookie.
        const response = await context.request.fetch(path, {
          method,
          headers: { origin: server.origin },
          data,
        })
        if (response.status() !== 200)
          throw new Error(`${method} ${path}: ${response.status()} ${await response.text()}`)
        return response
      },
    })
  },
})

async function expireSession(context: BrowserContext, server: Server) {
  if (!server.token) throw new Error('Journey must declare auth to expire a session')
  const expired = await sessionToken(server.token.secret, Math.floor(Date.now() / 1000) - 1)
  await context.addCookies([sessionCookie(expired, Math.floor(Date.now() / 1000) + 900)])
}
