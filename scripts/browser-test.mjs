import { randomBytes, randomUUID } from 'node:crypto'
import { spawn, execFileSync } from 'node:child_process'
import { once } from 'node:events'
import { createServer } from 'node:net'
import { existsSync } from 'node:fs'
import { mkdir, unlink, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { encode } from 'next-auth/jwt'
import { Miniflare, convertV4MiniflareOptions } from 'miniflare'
import { setTime } from '../tests/helpers/browser-actions.mjs'
import { applyD1Migrations } from '../tests/helpers/d1-migrations.mjs'

const args = process.argv.slice(2)
const journeyName = args[0]
const viewport = args[2]
const fail = (message) => {
  console.error(message)
  process.exitCode = 1
}
if (!journeyName || !/^[a-z][a-z0-9-]*$/.test(journeyName)) {
  fail('Usage: pnpm test:browser <journey-name> --viewport <width>x<height>')
  process.exit()
}
if (
  args.length !== 3 ||
  args[1] !== '--viewport' ||
  !/^\d{2,4}x\d{2,4}$/.test(viewport ?? '') ||
  viewport.split('x').some((size) => Number(size) <= 0)
) {
  fail(`Invalid or missing viewport. Use --viewport widthxheight, for example 390x844.`)
  process.exit()
}
const journeyPath = resolve('tests/browser', `${journeyName}.journey.mjs`)
let journey
try {
  journey = await import(journeyPath)
} catch {
  fail(`Unknown browser journey "${journeyName}". Expected ${journeyPath}.`)
  process.exit()
}
if (
  typeof journey.dependencies?.auth !== 'boolean' ||
  typeof journey.dependencies?.storage !== 'boolean'
) {
  fail(`Journey ${journeyName} must declare boolean auth and storage dependencies.`)
  process.exit()
}
try {
  execFileSync('agent-browser', ['--version'], { stdio: 'ignore' })
} catch {
  fail(
    'agent-browser is required. Install it with: npm i -g agent-browser && agent-browser install',
  )
  process.exit()
}
if (!existsSync('.next/BUILD_ID')) {
  fail('Production build missing. Run: pnpm build --webpack')
  process.exit()
}
if (journey.dependencies.storage && !existsSync('.worker-build/index.js')) {
  fail('Worker bundle missing. Run exactly: pnpm worker:build')
  process.exit()
}

const artifactDir = resolve('.browser-artifacts', `${Date.now()}-${journeyName}`)
await mkdir(artifactDir, { recursive: true })
const session = `meddies-${randomUUID()}`
const secret = randomBytes(32).toString('base64url')
const workerSecret = randomBytes(32).toString('base64url')
let worker, child, origin
let database
let serviceLogs = ''
let currentStep = 'startup'
let browserStarted = false
let interrupted = false
const ensureNotInterrupted = () => {
  if (interrupted) throw new Error(currentStep)
}
const runBrowser = (browserArgs, { cleanup = false } = {}) => {
  if (!cleanup) ensureNotInterrupted()
  try {
    return execFileSync('agent-browser', ['--session', session, ...browserArgs], {
      encoding: 'utf8',
      timeout: 30_000,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
  } catch (error) {
    throw new Error(`agent-browser ${browserArgs[0]} failed (${error.code ?? 'non-zero exit'})`)
  }
}
const expireSession = async () => {
  const expiredToken = await encode({
    secret,
    salt: 'authjs.session-token',
    token: {
      sub: 'google:browser-harness',
      email: 'approved@example.test',
      version: '1',
      deadline: Math.floor(Date.now() / 1000) - 1,
    },
    maxAge: 900,
  })
  const expiredState = resolve(artifactDir, 'expired-session-state.json')
  await writeFile(
    expiredState,
    JSON.stringify({
      cookies: [
        {
          name: 'authjs.session-token',
          value: expiredToken,
          domain: 'localhost',
          path: '/',
          expires: Math.floor(Date.now() / 1000) + 900,
          httpOnly: true,
          secure: false,
          sameSite: 'Lax',
        },
      ],
      origins: [],
    }),
    { mode: 0o600 },
  )
  try {
    runBrowser(['state', 'load', expiredState])
  } finally {
    await unlink(expiredState).catch(() => {})
  }
}
const browser = {
  run: (...browserArgs) => runBrowser(browserArgs),
  step: (name) => {
    currentStep = name
  },
  open: (url) => runBrowser(['open', url]),
  setTime: (selector, value) => setTime(browser.run, selector, value),
  expireSession,
  snapshot: () => runBrowser(['snapshot']),
  close: () => {
    if (browserStarted)
      try {
        runBrowser(['close'], { cleanup: true })
      } catch {}
  },
}
const handleInterrupt = (signal) => {
  interrupted = true
  currentStep = `interrupted by ${signal}`
  child?.kill('SIGTERM')
}
process.once('SIGINT', () => handleInterrupt('SIGINT'))
process.once('SIGTERM', () => handleInterrupt('SIGTERM'))

try {
  if (journey.dependencies.storage) {
    worker = new Miniflare(
      convertV4MiniflareOptions({
        modules: true,
        scriptPath: '.worker-build/index.js',
        compatibilityDate: '2026-11-03',
        host: '127.0.0.1',
        d1Databases: ['DB'],
        bindings: { MEDICINES_WORKER_SECRET: workerSecret },
      }),
    )
    database = await worker.getD1Database('DB')
    await applyD1Migrations(database)
  }
  if (journey.seed) await journey.seed({ db: database, ownerId: 'google:browser-harness' })
  const workerUrl = worker ? await worker.ready : undefined
  const probe = createServer()
  probe.listen(0, '127.0.0.1')
  await once(probe, 'listening')
  const port = probe.address().port
  await new Promise((resolveClose) => probe.close(resolveClose))
  origin = `http://localhost:${port}`
  const env = Object.fromEntries(
    Object.entries(process.env).filter(
      ([key]) =>
        !key.startsWith('AUTH_') &&
        !['MEDICINES_WORKER_URL', 'MEDICINES_WORKER_SECRET'].includes(key),
    ),
  )
  const expires = Math.floor(Date.now() / 1000) + 900
  const cookie = journey.dependencies.auth
    ? await encode({
        secret,
        salt: 'authjs.session-token',
        token: {
          sub: 'google:browser-harness',
          email: 'approved@example.test',
          version: '1',
          deadline: expires,
        },
        maxAge: 900,
      })
    : undefined
  ensureNotInterrupted()
  child = spawn(
    process.execPath,
    ['node_modules/next/dist/bin/next', 'start', '-H', '127.0.0.1', '-p', String(port)],
    {
      env: {
        ...env,
        MEDICINES_WORKER_URL: workerUrl?.toString() ?? '',
        MEDICINES_WORKER_SECRET: worker ? workerSecret : '',
        AUTH_URL: origin,
        AUTH_SECRET: cookie ? secret : '',
        AUTH_GOOGLE_ID: cookie ? 'synthetic-client' : '',
        AUTH_GOOGLE_SECRET: cookie ? 'synthetic-secret' : '',
        AUTH_ALLOWED_EMAIL: cookie ? 'approved@example.test' : '',
        AUTH_SESSION_VERSION: cookie ? '1' : '',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  )
  const addLogs = (buffer) => {
    serviceLogs = (serviceLogs + buffer.toString()).slice(-8000)
  }
  child.stdout.on('data', addLogs)
  child.stderr.on('data', addLogs)
  const request = (path, options = {}) =>
    fetch(`${origin}${path}`, {
      ...options,
      headers: {
        ...(cookie ? { cookie: `authjs.session-token=${cookie}` } : {}),
        ...options.headers,
      },
    })
  let ready = false
  for (let attempt = 0; attempt < 100; attempt++) {
    ensureNotInterrupted()
    if (child.exitCode !== null) throw new Error('Next.js exited during startup')
    try {
      const response = await request('/api/session')
      if (
        cookie
          ? response.ok && (await response.json()).id === 'google:browser-harness'
          : response.status === 401
      ) {
        ready = true
        break
      }
    } catch {}
    await delay(100)
  }
  if (!ready) throw new Error('Next.js /api/session readiness check failed')
  ensureNotInterrupted()
  browserStarted = true
  runBrowser(['set', 'viewport', ...viewport.split('x')])
  if (cookie) {
    const cookieFile = resolve(artifactDir, 'session-state.json')
    await writeFile(
      cookieFile,
      JSON.stringify({
        cookies: [
          {
            name: 'authjs.session-token',
            value: cookie,
            domain: 'localhost',
            path: '/',
            expires,
            httpOnly: true,
            secure: false,
            sameSite: 'Lax',
          },
        ],
        origins: [],
      }),
      { mode: 0o600 },
    )
    try {
      runBrowser(['state', 'load', cookieFile])
    } finally {
      await unlink(cookieFile).catch(() => {})
    }
  }
  currentStep = 'journey setup'
  await journey.run({ origin, browser, request, artifactDir, session })
  ensureNotInterrupted()
  console.log(`PASS ${journeyName} at ${viewport}`)
} catch (error) {
  const message = interrupted ? currentStep : `${currentStep}: ${error.message}`
  console.error(`FAIL step "${message}" at viewport ${viewport}`)
  if (browserStarted)
    try {
      runBrowser(['screenshot', resolve(artifactDir, 'failure.png')], { cleanup: true })
    } catch {}
  if (serviceLogs) {
    const redacted = serviceLogs
      .replaceAll(secret, '[redacted]')
      .replaceAll(workerSecret, '[redacted]')
      .slice(-8000)
    await writeFile(resolve(artifactDir, 'service.log'), redacted).catch(() => {})
  }
  console.error(`Artifacts: ${artifactDir}`)
  process.exitCode = interrupted ? 130 : 1
} finally {
  browser.close()
  await worker?.dispose()
  const childIsAlive = () => child && child.exitCode === null && child.signalCode === null
  if (childIsAlive()) {
    child.kill('SIGTERM')
    await Promise.race([once(child, 'exit'), delay(3000)])
    if (childIsAlive()) {
      child.kill('SIGKILL')
      await Promise.race([once(child, 'exit'), delay(1000)])
    }
  }
}
