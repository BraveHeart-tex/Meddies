import { randomBytes } from 'node:crypto'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { rename, unlink, writeFile } from 'node:fs/promises'
import { createServer, type AddressInfo } from 'node:net'
import { test as base, type APIResponse, type BrowserContext } from '@playwright/test'
import { encode } from 'next-auth/jwt'
import {
  routeRenderPath,
  startWorkerProxy,
  type WorkerControls,
  type WorkerProxy,
} from './worker-proxy'

import { cleanupJourney, JourneyService } from './journey-server'
import { startJourneyWorker, type JourneyDatabase, type JourneyWorker } from './journey-worker'

export { expect } from '@playwright/test'

export type { JourneyDatabase }

export type Journey = {
  /** Sign in with a synthetic Auth.js session. No Google provider is used. */
  auth: boolean
  /** Use the local Worker with an emptied, migrated Miniflare D1 database. */
  storage: boolean
  /** Freeze the scheduling clock at this instant; move it with `app.setScheduleTime`. */
  initialScheduleTime?: string
  /** Seed the fresh database before Next.js starts. Requires `storage`. */
  seed?: (fixture: { db: JourneyDatabase; ownerId: string }) => Promise<unknown>
}

type Server = {
  origin: string
  token?: { secret: string; value: string; expires: number }
  workerSecret: string
  setScheduleTime(instant: string): Promise<void>
  worker?: WorkerControls
}

export type App = {
  origin: string
  /** Move the frozen scheduling clock seen by Next.js and the Worker. */
  setScheduleTime(instant: string): Promise<void>
  /** Replace the browser session cookie with an expired one. */
  expireSession(): Promise<void>
  /** Put back the original session cookie, standing in for signing in again. */
  restoreSession(): Promise<void>
  /** This run's private values, to assert they never reach the browser. Requires `auth`. */
  credentials(): { sessionToken: string; authSecret: string; workerSecret: string }
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

export const test = base.extend<
  { journey: Journey; server: Server; app: App },
  { journeyWorker: () => Promise<JourneyWorker> }
>({
  journey: [{ auth: false, storage: false }, { option: true }],

  // One local Worker per Playwright worker, started by the first journey that uses storage.
  journeyWorker: [
    async ({}, use) => {
      let started: Promise<JourneyWorker> | undefined
      try {
        await use(() => (started ??= startJourneyWorker()))
      } finally {
        await (await started?.catch(() => undefined))?.dispose()
      }
    },
    { scope: 'worker' },
  ],

  // Per-test Next.js server, Worker proxy, emptied D1 database and scheduling-clock file.
  server: async ({ journey, journeyWorker }, use, testInfo) => {
    const secret = randomBytes(32).toString('base64url')
    const clockFile = journey.initialScheduleTime
      ? testInfo.outputPath('scheduling-clock')
      : undefined
    const setScheduleTime = async (instant: string) => {
      if (!clockFile) throw new Error('Journey must declare initialScheduleTime')
      await writeFile(`${clockFile}.next`, new Date(instant).toISOString())
      await rename(`${clockFile}.next`, clockFile)
    }
    let proxy: WorkerProxy | undefined
    let workerSecret = randomBytes(32).toString('base64url')
    const secrets = [secret, 'synthetic-secret']
    const service = new JourneyService(secrets)
    let setupFailed = true
    let failure: unknown
    try {
      if (clockFile) await setScheduleTime(journey.initialScheduleTime!)
      if (journey.seed && !journey.storage) throw new Error('Journey seed requires storage')
      const worker = journey.storage ? await journeyWorker() : undefined
      if (worker) {
        workerSecret = worker.secret
        secrets.push(workerSecret)
        const db = await worker.startJourney(clockFile)
        await journey.seed?.({ db, ownerId })
        // Next.js reaches the Worker through a proxy, so journeys can control server reads.
        proxy = await startWorkerProxy(worker.url, {
          onError: (line) => service.addLog(`${line}\n`),
        })
      }
      const port = await freePort()
      const origin = `http://localhost:${port}`
      const expires = Math.floor(Date.now() / 1000) + 900
      const token = journey.auth
        ? { secret, value: await sessionToken(secret, expires), expires }
        : undefined
      if (token) secrets.push(token.value)
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
      service.start(() =>
        spawn(
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
              MEDDIES_BROWSER_ROUTE_HOLD_URL: proxy ? new URL(routeRenderPath, proxy.url).href : '',
              MEDICINES_WORKER_URL: proxy?.url.toString() ?? '',
              MEDICINES_WORKER_SECRET: worker ? workerSecret : '',
              AUTH_URL: origin,
              AUTH_SECRET: token ? secret : '',
              AUTH_GOOGLE_ID: token ? 'synthetic-client' : '',
              AUTH_GOOGLE_SECRET: token ? 'synthetic-secret' : '',
              AUTH_ALLOWED_EMAILS: token ? email : '',
              AUTH_SESSION_VERSION: token ? '1' : '',
            },
            stdio: ['ignore', 'pipe', 'pipe'],
          },
        ),
      )
      // Dev mode compiles /api/session on the first request. The budget includes body reads.
      await service.waitUntilReady(
        origin,
        token ? { cookie: `${cookieName}=${token.value}`, ownerId } : undefined,
        dev ? 60_000 : 10_000,
      )
      setupFailed = false

      // Journeys get the controls only, not the proxy's lifecycle.
      const { url: _url, close: _close, ...controls } = proxy ?? {}
      await use({
        origin,
        token,
        workerSecret,
        setScheduleTime,
        worker: proxy && (controls as WorkerControls),
      })
    } catch (error) {
      failure = error
      throw error
    } finally {
      await cleanupJourney([
        () => service.stop(),
        async () => {
          if (setupFailed || testInfo.status !== testInfo.expectedStatus)
            await testInfo.attach('service.log', {
              body: service.log() || '(no output)',
              contentType: 'text/plain',
            })
        },
        async () => proxy?.close(),
        async () => {
          if (clockFile) {
            await unlink(clockFile).catch((error) => {
              if (error.code !== 'ENOENT') throw error
            })
            await unlink(`${clockFile}.next`).catch((error) => {
              if (error.code !== 'ENOENT') throw error
            })
          }
        },
      ]).catch((error) => {
        if (!failure) throw error
        // Preserve the inline startup failure if evidence collection also failed.
      })
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
      restoreSession: async () => {
        if (!server.token) throw new Error('Journey must declare auth to restore a session')
        await context.addCookies([sessionCookie(server.token.value, server.token.expires)])
      },
      get worker() {
        if (!server.worker) throw new Error('Journey must declare storage to control the Worker')
        return server.worker
      },
      credentials: () => {
        if (!server.token) throw new Error('Journey must declare auth to read its credentials')
        return {
          sessionToken: server.token.value,
          authSecret: server.token.secret,
          workerSecret: server.workerSecret,
        }
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
