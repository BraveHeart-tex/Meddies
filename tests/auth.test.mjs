import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { createServer } from 'node:net'
import { setTimeout as delay } from 'node:timers/promises'
import { after, before, test } from 'node:test'
import { encode } from 'next-auth/jwt'
import { readFile } from 'node:fs/promises'
import { Miniflare, convertV4MiniflareOptions } from 'miniflare'

// Synthetic signed cookies prove session authorization, never Google identity verification.
const secret = randomBytes(32).toString('base64url')
const salt = 'authjs.session-token'
let child
let worker
const workerSecret = randomBytes(32).toString('base64url')
let base
const valid = () => ({
  sub: 'google:synthetic-subject',
  email: 'approved@example.test',
  version: '1',
  deadline: Math.floor(Date.now() / 1000) + 60,
})
const cookie = async (claims, maxAge = 120) =>
  `${salt}=${await encode({ secret, salt, token: claims, maxAge })}`
const request = (path, options = {}) => fetch(`${base}${path}`, { redirect: 'manual', ...options })

async function csrfSession() {
  const response = await request('/api/auth/csrf')
  const { csrfToken } = await response.json()
  const cookies = response.headers
    .getSetCookie()
    .map((value) => value.split(';')[0])
    .join('; ')
  return { csrfToken, cookies }
}

before(async () => {
  worker = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      scriptPath: '.worker-build/index.js',
      compatibilityDate: '2026-11-03',
      d1Databases: ['DB'],
      bindings: { MEDICINES_WORKER_SECRET: workerSecret },
    }),
  )
  const db = await worker.getD1Database('DB')
  await db.exec(
    (await readFile('worker/migrations/0001_user_medications.sql', 'utf8')).replaceAll('\n', ' '),
  )
  await db.exec(
    (await readFile('worker/migrations/0002_daily_schedules.sql', 'utf8')).replaceAll('\n', ' '),
  )
  const workerUrl = await worker.ready
  const listener = createServer()
  listener.listen(0, '127.0.0.1')
  await once(listener, 'listening')
  const port = listener.address().port
  await new Promise((resolve) => listener.close(resolve))
  base = `http://localhost:${port}`
  // Do not inherit any real auth configuration from the invoking environment.
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !key.startsWith('AUTH_')),
  )
  child = spawn(
    process.execPath,
    ['node_modules/next/dist/bin/next', 'start', '-p', String(port)],
    {
      env: {
        ...env,
        MEDICINES_WORKER_URL: workerUrl.toString(),
        MEDICINES_WORKER_SECRET: workerSecret,
        AUTH_URL: base,
        AUTH_SECRET: secret,
        AUTH_GOOGLE_ID: 'synthetic-client',
        AUTH_GOOGLE_SECRET: 'synthetic-secret',
        AUTH_ALLOWED_EMAIL: 'approved@example.test',
        AUTH_SESSION_VERSION: '1',
      },
      stdio: 'ignore',
    },
  )
  for (let i = 0; i < 100; i++) {
    assert.equal(child.exitCode, null, 'production server must remain running')
    try {
      if ((await request('/api/session')).status === 401) return
    } catch {
      /* Server is still starting. */
    }
    await delay(100)
  }
  assert.fail('production server did not become ready')
})

after(async () => {
  await worker?.dispose()
  if (child && child.exitCode === null) {
    child.kill('SIGTERM')
    await once(child, 'exit')
  }
})

test('anonymous requests cannot read the account; entry offers private Google sign-in', async () => {
  const response = await request('/api/session')
  assert.equal(response.status, 401)
  assert.match(response.headers.get('cache-control'), /no-store/)
  const page = await request('/')
  assert.equal(page.status, 200)
  assert.match(await page.text(), /Continue with Google/)
})

test('session reads preserve provider identity and absolute expiry without disclosing email', async () => {
  const claims = valid()
  const headers = { cookie: await cookie(claims) }
  for (const path of ['/api/session', '/api/session?ownerId=google:someone-else']) {
    const response = await request(path, { headers })
    assert.equal(response.status, 200)
    assert.match(response.headers.get('cache-control'), /no-store/)
    assert.deepEqual(await response.json(), {
      id: 'google:synthetic-subject',
      expires: new Date(claims.deadline * 1000).toISOString(),
    })
  }
  const response = await request('/api/auth/session', { headers })
  const session = await response.json()
  assert.deepEqual(session.user, { id: 'google:synthetic-subject' })
  assert.equal(session.expires, new Date(claims.deadline * 1000).toISOString())
  assert(!JSON.stringify(session).includes('approved@example.test'))
  const page = await request('/', { headers })
  const html = await page.text()
  assert.match(html, /Welcome back/)
  assert.match(html, /Sign out/)
  assert(!html.includes('approved@example.test'))
})

test('wrong identity, revoked, expired and malformed sessions are rejected', async () => {
  const claims = valid()
  for (const patch of [
    { email: 'someone-else@example.test' },
    { sub: undefined },
    { sub: 'google:' },
    { sub: 'other:synthetic-subject' },
    { version: 'revoked' },
    { deadline: Math.floor(Date.now() / 1000) },
    { deadline: Math.floor(Date.now() / 1000) - 1 },
    { deadline: 'tomorrow' },
    { deadline: undefined },
  ]) {
    const headers = { cookie: await cookie({ ...claims, ...patch }) }
    assert.equal((await request('/api/session', { headers })).status, 401)
  }
  // Auth.js permits 15 seconds of JWT clock skew; the absolute deadline above permits none.
  const expiredJwt = await cookie(claims, -60)
  for (const value of [
    expiredJwt,
    `${salt}=corrupt`,
    await cookie({ ...claims, email: 'other@example.test' }),
  ]) {
    assert.equal((await request('/api/session', { headers: { cookie: value } })).status, 401)
  }
})

test('client session updates cannot replace the authenticated identity or extend expiry', async () => {
  const claims = valid()
  const { csrfToken, cookies } = await csrfSession()
  const response = await request('/api/auth/session', {
    method: 'POST',
    headers: { cookie: `${await cookie(claims)}; ${cookies}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      csrfToken,
      data: { sub: 'google:attacker', deadline: 9999999999, user: { id: 'google:attacker' } },
    }),
  })
  const session = await response.json()
  assert.equal(session.user.id, 'google:synthetic-subject')
  assert.equal(session.expires, new Date(claims.deadline * 1000).toISOString())
})

test('Google initiation uses state and PKCE; invalid callbacks do not create sessions', async () => {
  const { csrfToken, cookies } = await csrfSession()
  const response = await request('/api/auth/signin/google', {
    method: 'POST',
    headers: { cookie: cookies, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ csrfToken, callbackUrl: base }),
  })
  assert.equal(response.status, 302)
  const target = new URL(response.headers.get('location'))
  assert.equal(target.origin, 'https://accounts.google.com')
  assert.equal(target.searchParams.get('redirect_uri'), `${base}/api/auth/callback/google`)
  assert.equal(target.searchParams.get('code_challenge_method'), 'S256')
  assert(target.searchParams.get('state'))
  assert(target.searchParams.get('code_challenge'))
  const invalid = await request('/api/auth/callback/google?code=invalid&state=invalid')
  assert.equal(invalid.status, 302)
  assert.match(invalid.headers.get('location'), /error=/)
  assert(
    !invalid.headers
      .getSetCookie()
      .some((value) => value.startsWith(`${salt}=`) && !value.startsWith(`${salt}=;`)),
  )
})

test('sign-out requires CSRF, clears the browser session and prevents subsequent account reads', async () => {
  const signedInCookie = await cookie(valid())
  const rejected = await request('/api/auth/signout', {
    method: 'POST',
    headers: { cookie: signedInCookie },
  })
  assert(!rejected.headers.getSetCookie().some((value) => value.startsWith(`${salt}=`)))
  const { csrfToken, cookies } = await csrfSession()
  const response = await request('/api/auth/signout', {
    method: 'POST',
    headers: {
      cookie: `${signedInCookie}; ${cookies}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ csrfToken, callbackUrl: base }),
  })
  assert.equal(response.status, 302)
  assert(
    response.headers
      .getSetCookie()
      .some((value) => value.startsWith(`${salt}=;`) && /Max-Age=0/i.test(value)),
  )
  const cleared = response.headers
    .getSetCookie()
    .filter((value) => value.startsWith(`${salt}=`))
    .map((value) => value.split(';')[0])
    .join('; ')
  assert.equal((await request('/api/session', { headers: { cookie: cleared } })).status, 401)
})

test('medicine HTTP boundary confirms saves, rejects cross-user access and unsafe requests', async () => {
  const alice = { cookie: await cookie(valid()) }
  const bob = { cookie: await cookie({ ...valid(), sub: 'google:bob' }) }
  const medicine = {
    id: '4ce08b21-58da-4e81-adb1-c156356a2c1a',
    label: 'Vitamin D3',
    strength: '1000 IU',
    unit: 'tablet',
  }
  const save = (input, headers = alice) =>
    request('/api/medicines', {
      method: 'POST',
      headers: { ...headers, origin: base, 'content-type': 'application/json' },
      body: JSON.stringify(input),
    })
  assert.equal((await request('/api/medicines')).status, 401)
  assert.equal((await save(medicine, {})).status, 401)
  const unsafe = await request('/api/medicines', {
    method: 'POST',
    headers: { ...alice, origin: 'https://other.example', 'content-type': 'application/json' },
    body: JSON.stringify(medicine),
  })
  assert.equal(unsafe.status, 403)
  assert.equal((await save({ ...medicine, label: ' ' })).status, 400)
  const saved = await save({ ...medicine, ownerId: 'google:bob' })
  assert.equal(saved.status, 200)
  assert.deepEqual(await saved.json(), { medicines: [medicine] })
  assert.equal((await save(medicine)).status, 200)
  assert.equal((await save({ ...medicine, strength: '5 mg' })).status, 409)
  const reload = await request('/api/medicines', { headers: alice })
  assert.match(reload.headers.get('cache-control'), /no-store/)
  assert.deepEqual(await reload.json(), { medicines: [medicine] })
  assert.deepEqual(await (await request('/api/medicines', { headers: bob })).json(), {
    medicines: [],
  })
  const schedule = {
    id: 'ad29d745-7ef1-4b26-91c2-ae9926d6b659',
    medicineId: medicine.id,
    startDate: '2099-12-31',
    times: [{ time: '09:00', quantity: 0.5 }],
  }
  const scheduleSave = (headers, origin = base) =>
    request('/api/schedules', {
      method: 'POST',
      headers: { ...headers, origin, 'content-type': 'application/json' },
      body: JSON.stringify({ ...schedule, ownerId: 'google:bob' }),
    })
  assert.equal((await request('/api/schedules')).status, 401)
  assert.equal((await scheduleSave({})).status, 401)
  assert.equal((await scheduleSave(alice, 'https://other.example')).status, 403)
  assert.equal((await scheduleSave(bob)).status, 400)
  const confirmed = await scheduleSave(alice)
  assert.equal(confirmed.status, 200)
  const scheduled = await confirmed.json()
  assert.deepEqual(await (await scheduleSave(alice)).json(), scheduled)
  const routine = await request('/api/schedules', { headers: alice })
  assert.match(routine.headers.get('cache-control'), /no-store/)
  const routineBody = await routine.json()
  assert.deepEqual(routineBody.schedules, scheduled.schedules)
  assert.equal(routineBody.today.next.dueAt, '2099-12-31T06:00:00.000Z')
  assert.deepEqual((await (await request('/api/schedules', { headers: bob })).json()).schedules, [])
  const oversized = await save({ ...medicine, label: 'x'.repeat(5000) })
  assert.equal(oversized.status, 413)
  await worker.dispose()
  const unavailable = await save({ ...medicine, id: '8c4ea91b-c9df-4d47-8cd0-54c1892c4e52' })
  assert.equal(unavailable.status, 503)
  assert.deepEqual(await unavailable.json(), { error: 'unavailable' })
  assert.equal((await scheduleSave(alice)).status, 503)
})

test('missing private configuration disables sign-in and preserves accessible recovery', async () => {
  child.kill('SIGTERM')
  await once(child, 'exit')
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !key.startsWith('AUTH_')),
  )
  child = spawn(
    process.execPath,
    ['node_modules/next/dist/bin/next', 'start', '-p', new URL(base).port],
    {
      env: {
        ...env,
        AUTH_URL: base,
        AUTH_SECRET: '',
        AUTH_GOOGLE_ID: '',
        AUTH_GOOGLE_SECRET: '',
        AUTH_ALLOWED_EMAIL: '',
      },
      stdio: 'ignore',
    },
  )
  let ready = false
  for (let i = 0; i < 100; i++) {
    assert.equal(child.exitCode, null)
    try {
      if ((await request('/api/auth/providers')).status === 503) {
        ready = true
        break
      }
    } catch {
      /* Server is still starting. */
    }
    await delay(100)
  }
  assert(ready, 'unconfigured server ready')
  for (const method of ['GET', 'POST']) {
    const response = await request('/api/auth/signin/google', { method })
    assert.equal(response.status, 503)
    assert.match(response.headers.get('cache-control'), /no-store/)
  }
  assert.equal(
    (await request('/api/session', { headers: { cookie: await cookie(valid()) } })).status,
    401,
  )
  const page = await request('/')
  const html = await page.text()
  assert.match(html, /Sign-in is temporarily unavailable/)
  assert(!html.includes('Continue with Google'))
})
