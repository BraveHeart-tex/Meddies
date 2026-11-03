import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { createServer } from 'node:net'
import { setTimeout as delay } from 'node:timers/promises'
import { after, before, test } from 'node:test'
import { encode } from 'next-auth/jwt'

// Synthetic signed cookies prove session authorization, never Google identity verification.
const secret = randomBytes(32).toString('base64url')
const salt = 'authjs.session-token'
let child
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

before(async () => {
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
  const csrf = await request('/api/auth/csrf')
  const { csrfToken } = await csrf.json()
  const cookies = csrf.headers
    .getSetCookie()
    .map((value) => value.split(';')[0])
    .join('; ')
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
  const csrf = await request('/api/auth/csrf')
  const { csrfToken } = await csrf.json()
  const cookies = csrf.headers
    .getSetCookie()
    .map((value) => value.split(';')[0])
    .join('; ')
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
  const csrf = await request('/api/auth/csrf')
  const { csrfToken } = await csrf.json()
  const cookies = csrf.headers
    .getSetCookie()
    .map((value) => value.split(';')[0])
    .join('; ')
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
