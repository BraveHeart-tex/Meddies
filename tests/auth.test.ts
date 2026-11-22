import type { ChildProcess } from 'node:child_process'
import type { AddressInfo } from 'node:net'
import type { JWT } from 'next-auth/jwt'
import {
  parseMedicine,
  parseMedicineRecord,
  type Medicine,
} from '../src/features/medicines/contract'
import type {
  DailyScheduleInput,
  DoseCorrectionInput,
  DoseOccurrence,
} from '../src/features/schedules/contract'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { createServer } from 'node:net'
import { setTimeout as delay } from 'node:timers/promises'
import { afterAll, beforeAll, test } from 'vitest'
import { encode } from 'next-auth/jwt'
import { createWorker } from '../worker/index'
import { istanbulDate } from '../src/features/schedules/contract'
import { Miniflare, convertV4MiniflareOptions } from 'miniflare'
import { applyD1Migrations } from './helpers/d1-migrations.mjs'

// Synthetic signed cookies prove session authorization, never Google identity verification.
const secret = randomBytes(32).toString('base64url')
const salt = 'authjs.session-token'
let child: ChildProcess
let worker: Miniflare
const workerSecret = randomBytes(32).toString('base64url')
let base: string
const valid = () => ({
  sub: 'google:synthetic-subject',
  email: 'approved@example.test',
  version: '1',
  deadline: Math.floor(Date.now() / 1000) + 60,
})
const cookie = async (claims: JWT, maxAge = 120) =>
  `${salt}=${await encode({ secret, salt, token: claims, maxAge })}`
const request = (path: string, options: RequestInit = {}) =>
  fetch(`${base}${path}`, { redirect: 'manual', ...options })

async function csrfSession() {
  const response = await request('/api/auth/csrf')
  const { csrfToken } = await response.json()
  const cookies = response.headers
    .getSetCookie()
    .map((value) => value.split(';')[0])
    .join('; ')
  return { csrfToken, cookies }
}

beforeAll(async () => {
  worker = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      scriptPath: '.worker-build/index.js',
      compatibilityDate: '2026-11-03',
      d1Databases: ['DB'],
      bindings: { MEDICINES_WORKER_SECRET: workerSecret },
    }),
  )
  await applyD1Migrations(await worker.getD1Database('DB'))
  const workerUrl = await worker.ready
  const listener = createServer()
  listener.listen(0, '127.0.0.1')
  await once(listener, 'listening')
  const port = (listener.address() as AddressInfo).port
  await new Promise((resolve) => listener.close(resolve))
  base = `http://localhost:${port}`
  // Do not inherit any real auth configuration from the invoking environment.
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !key.startsWith('AUTH_')),
  ) as NodeJS.ProcessEnv
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
        AUTH_ALLOWED_EMAILS: ' approved@example.test, , Second@Example.test ',
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

afterAll(async () => {
  await worker?.dispose()
  if (child && child.exitCode === null) {
    child.kill('SIGTERM')
    await once(child, 'exit')
  }
})

test('anonymous requests cannot read the account; entry offers private Google sign-in', async () => {
  const response = await request('/api/session')
  assert.equal(response.status, 401)
  assert.match(response.headers.get('cache-control')!, /no-store/)
  const page = await request('/')
  assert.equal(page.status, 200)
  assert.match(await page.text(), /Continue with Google/)
})

test('sign-in alias redirects without swallowing the sign-in error route', async () => {
  const response = await request('/sign-in')
  assert.equal(response.status, 307)
  assert.equal(new URL(response.headers.get('location')!, base).pathname, '/')
  const error = await request('/sign-in/error?error=AccessDenied')
  assert.equal(error.status, 200)
  assert.match(await error.text(), /Choose another Google account/)
})

test('sign-in explains why the account is back on the entry screen', async () => {
  const messages = [
    ['/?error=AccessDenied', "This Google account can't open Meddies."],
    ['/?error=OAuthCallbackError', "Sign-in didn't finish."],
    ['/?reason=expired', 'Your session ended.'],
  ]
  for (const [path, message] of messages) {
    const html = await (await request(path)).text()
    assert(html.replaceAll('&#x27;', "'").includes(message), path)
  }
})

test('private deep links offer sign-in while retaining the requested destination', async () => {
  for (const path of ['/medications', '/history?date=2026-10-30', '/settings']) {
    const page = await request(path)
    const html = await page.text()
    const location = page.headers.get('location')!
    const signInTarget = location || html
    assert.ok(signInTarget.includes(`returnTo=${encodeURIComponent(path)}`), path)
    assert.ok(location || html.includes('http-equiv="refresh"'), 'must redirect, not link')
    assert.doesNotMatch(html, /Save medication|I skipped it instead|Sign out/)
  }
})

test('session reads preserve provider identity and absolute expiry without disclosing email', async () => {
  const claims = {
    ...valid(),
    givenName: 'Ayşe',
    deadline: Date.parse('2099-11-13T11:02:00Z') / 1000,
  }
  const headers = { cookie: await cookie(claims) }
  for (const path of ['/api/session', '/api/session?ownerId=google:someone-else']) {
    const response = await request(path, { headers })
    assert.equal(response.status, 200)
    assert.match(response.headers.get('cache-control')!, /no-store/)
    assert.deepEqual(await response.json(), {
      id: 'google:synthetic-subject',
      expires: new Date(claims.deadline * 1000).toISOString(),
    })
  }
  const response = await request('/api/auth/session', { headers })
  const session = await response.json()
  assert.deepEqual(session.user, { id: 'google:synthetic-subject', givenName: 'Ayşe' })
  assert.equal(session.expires, new Date(claims.deadline * 1000).toISOString())
  assert(!JSON.stringify(session).includes('approved@example.test'))
  const page = await request('/', { headers })
  const html = await page.text()
  assert.match(html, /<a\b(?=[^>]*\baria-current="page")(?=[^>]*\bhref="\/")[^>]*>/)
  assert.match(html, /href="\/medications"/)
  assert.match(html, /href="\/history"/)
  assert.match(html, /href="\/settings"/)
  const settings = await request('/settings', { headers })
  assert.equal(settings.status, 200)
  const settingsHtml = await settings.text()
  assert.match(settingsHtml, /Google account[\s\S]*Approved/)
  assert.match(settingsHtml, /Sign out/)
  assert.match(settingsHtml, /Fri 13 Nov/)
  assert.match(settingsHtml, /14:02/)
  assert(settingsHtml.includes(new Date(claims.deadline * 1000).toISOString()))
  assert(!settingsHtml.includes('approved@example.test'))
  assert(!settingsHtml.includes('Back to Today'))
  assert(!html.includes('approved@example.test'))
  assert.match(html, /Good (morning|afternoon|evening), Ayşe/)
})

test('sessions without a usable first name keep the unnamed Today greeting', async () => {
  for (const givenName of [undefined, '', '   ']) {
    const claims = { ...valid(), givenName }
    const headers = { cookie: await cookie(claims) }
    const session = await (await request('/api/auth/session', { headers })).json()
    assert.deepEqual(session.user, { id: 'google:synthetic-subject' })
    const html = await (await request('/', { headers })).text()
    assert.match(html, /<h1[^>]*>Good (morning|afternoon|evening)<\/h1>/)
  }
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

test('a second approved account reads its own session', async () => {
  const claims = { ...valid(), sub: 'google:second-subject', email: 'second@example.test' }
  const response = await request('/api/session', { headers: { cookie: await cookie(claims) } })
  assert.equal(response.status, 200)
  assert.equal((await response.json()).id, 'google:second-subject')
})

test('client session updates cannot replace the authenticated identity, name or expiry', async () => {
  const claims = { ...valid(), givenName: 'Ayşe' }
  const { csrfToken, cookies } = await csrfSession()
  const response = await request('/api/auth/session', {
    method: 'POST',
    headers: { cookie: `${await cookie(claims)}; ${cookies}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      csrfToken,
      data: {
        sub: 'google:attacker',
        deadline: 9999999999,
        user: { id: 'google:attacker', givenName: 'Attacker' },
      },
    }),
  })
  const session = await response.json()
  assert.equal(session.user.id, 'google:synthetic-subject')
  assert.equal(session.user.givenName, 'Ayşe')
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
  const target = new URL(response.headers.get('location')!)
  assert.equal(target.origin, 'https://accounts.google.com')
  assert.equal(target.searchParams.get('redirect_uri'), `${base}/api/auth/callback/google`)
  assert.equal(target.searchParams.get('code_challenge_method'), 'S256')
  assert.deepEqual(
    new Set(target.searchParams.get('scope')?.split(' ')),
    new Set(['openid', 'email', 'profile']),
  )
  assert(target.searchParams.get('state'))
  assert(target.searchParams.get('code_challenge'))
  const invalid = await request('/api/auth/callback/google?code=invalid&state=invalid')
  assert.equal(invalid.status, 302)
  assert.match(invalid.headers.get('location')!, /error=/)
  assert(
    !invalid.headers
      .getSetCookie()
      .some((value) => value.startsWith(`${salt}=`) && !value.startsWith(`${salt}=;`)),
  )
})

test('Auth.js failures retain the initiated destination through the real error route', async () => {
  for (const destination of ['/history?date=2026-10-30', '/medications?add']) {
    const { csrfToken, cookies } = await csrfSession()
    const start = await request('/api/auth/signin/google', {
      method: 'POST',
      headers: { cookie: cookies, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ csrfToken, callbackUrl: `${base}${destination}` }),
    })
    assert.equal(
      new URL(start.headers.get('location')!).searchParams.get('prompt'),
      'select_account',
    )
    const continuation = start.headers
      .getSetCookie()
      .map((value) => value.split(';')[0])
      .join('; ')
    assert.match(continuation, /authjs.callback-url=/)
    for (const path of [
      '/api/auth/error?error=AccessDenied',
      '/api/auth/callback/google?code=invalid&state=invalid',
    ]) {
      const failure = await request(path, { headers: { cookie: continuation } })
      const location = new URL(failure.headers.get('location')!, base)
      assert.equal(location.pathname, '/sign-in/error')
      const page = await request(`${location.pathname}${location.search}`, {
        headers: { cookie: continuation },
      })
      const html = await page.text()
      assert.ok(html.includes(destination), 'error screen retains the callback destination')
      assert.match(
        html,
        path.includes('AccessDenied') ? /Choose another Google account/ : /Try again/,
      )
    }
  }
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

test('medication edit HTTP boundary preserves ownership and reloads Strength changes and dose snapshots', async () => {
  const alice = { cookie: await cookie({ ...valid(), sub: 'google:strength-http' }) }
  const bob = { cookie: await cookie({ ...valid(), sub: 'google:strength-http-other' }) }
  const id = '30000000-0000-4000-8000-000000000001'
  const medicine = { id, label: 'Example strength', strength: '200 mg', unit: 'tablet' }
  const post = (
    path: string,
    input: unknown,
    method = 'POST',
    headers: Record<string, string> = alice,
  ) =>
    request(path, {
      method,
      headers: { ...headers, origin: base, 'content-type': 'application/json' },
      body: JSON.stringify(input),
    })
  const created = await post('/api/medicines', medicine)
  assert.equal(created.status, 200)
  const initial = parseMedicineRecord(
    ((await created.json()) as { medicines: unknown[] }).medicines[0],
  )
  const takenAt = new Date(Math.floor(Date.now() / 60_000) * 60_000).toISOString()
  const dose = {
    actionId: '30000000-0000-4000-8000-000000000002',
    medicineId: id,
    takenAt,
    quantity: 1,
  }
  const recorded = await post('/api/schedules/unscheduled', dose)
  assert.equal(recorded.status, 200)
  const change = {
    actionId: '30000000-0000-4000-8000-000000000003',
    medicineId: id,
    expectedRevision: 0,
    strength: '400 mg',
    effectiveAt: takenAt,
    timeZone: 'Europe/Istanbul',
    ownerId: 'google:strength-http-other',
  }
  const command = { operation: 'changeStrength', change }
  assert.equal((await post('/api/medicines', command, 'PATCH', {})).status, 401)
  assert.equal((await post('/api/medicines', command, 'PATCH', bob)).status, 400)
  const unsafe = await request('/api/medicines', {
    method: 'PATCH',
    headers: { ...alice, origin: 'https://other.example', 'content-type': 'application/json' },
    body: JSON.stringify(command),
  })
  assert.equal(unsafe.status, 403)
  const changed = await post('/api/medicines', command, 'PATCH')
  assert.equal(changed.status, 200)
  const current = parseMedicineRecord((await changed.json()).medicines[0])
  assert.equal(current.lastActionId, change.actionId)
  assert.equal(current.strengthRevisions.length, 2)
  const correction = {
    actionId: '30000000-0000-4000-8000-000000000004',
    medicineId: id,
    expectedRevision: 1,
    strengthRevisionId: initial.currentStrengthRevisionId,
    label: medicine.label,
    strength: '250 mg',
    unit: 'tablet',
  }
  assert.equal(
    (await post('/api/medicines', { operation: 'correctDetails', correction }, 'PATCH')).status,
    200,
  )
  const read = await request('/api/medicines', { headers: alice })
  const latest = parseMedicineRecord(((await read.json()) as { medicines: unknown[] }).medicines[0])
  assert.equal(latest.strength, '400 mg')
  assert.equal(latest.strengthRevisions[0].strength, '250 mg')
  const today = await request('/api/schedules', { headers: alice })
  const snapshot = await today.json()
  assert.equal(snapshot.unscheduledDoses[0].strength, '250 mg')
  assert.equal(snapshot.unscheduledDoses[0].strengthRevisionId, initial.currentStrengthRevisionId)
})

test('medicine HTTP boundary confirms saves, rejects cross-user access and unsafe requests', async () => {
  const alice = { cookie: await cookie(valid()) }
  const bob = { cookie: await cookie({ ...valid(), sub: 'google:bob' }) }
  const medicine: Medicine = {
    id: '4ce08b21-58da-4e81-adb1-c156356a2c1a',
    label: 'Vitamin D3',
    strength: '1000 IU',
    unit: 'tablet',
  }
  const save = (input: unknown, headers: Record<string, string> = alice) =>
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
  assert.deepEqual(
    ((await saved.json()) as { medicines: unknown[] }).medicines.map(parseMedicine),
    [medicine],
  )
  assert.equal((await save({ ...medicine, strength: '5 mg' })).status, 409)
  const reload = await request('/api/medicines', { headers: alice })
  assert.match(reload.headers.get('cache-control')!, /no-store/)
  assert.deepEqual(
    ((await reload.json()) as { medicines: unknown[] }).medicines.map(parseMedicine),
    [medicine],
  )
  assert.deepEqual(await (await request('/api/medicines', { headers: bob })).json(), {
    medicines: [],
  })
  const schedule: DailyScheduleInput = {
    id: 'ad29d745-7ef1-4b26-91c2-ae9926d6b659',
    medicineId: medicine.id,
    startDate: '2099-12-31',
    times: [{ time: '09:00', quantity: 0.5 }],
  }
  const scheduleSave = (headers: Record<string, string>, origin = base) =>
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
  assert.equal(scheduled.schedules[0].id, schedule.id)
  const routine = await request('/api/schedules', { headers: alice })
  assert.match(routine.headers.get('cache-control')!, /no-store/)
  const routineBody = await routine.json()
  assert.deepEqual(routineBody.schedules, scheduled.schedules)
  assert.deepEqual((await (await request('/api/schedules', { headers: bob })).json()).schedules, [])
  const intakeMedicine: Medicine = {
    ...medicine,
    id: '3b57b05e-6d43-4c7a-9da8-16d9f1d36c11',
    label: 'Intake fixture',
    unit: 'capsule',
  }
  assert.equal((await save(intakeMedicine)).status, 200)
  const todayDate = istanbulDate(new Date())
  const intakeSchedule: DailyScheduleInput = {
    ...schedule,
    id: '6cc12abe-66bc-486b-8ed5-7264979c926f',
    medicineId: intakeMedicine.id,
    startDate: todayDate,
    times: [
      { time: '00:00', quantity: 1 },
      { time: '00:01', quantity: 1 },
    ],
  }
  const dueAt = new Date(`${todayDate}T00:00+03:00`).toISOString()
  const seed = await createWorker(() => new Date(Date.parse(dueAt) - 1)).fetch(
    new Request('http://worker/schedules', {
      method: 'POST',
      headers: { authorization: `Bearer ${workerSecret}` },
      body: JSON.stringify({
        operation: 'save',
        ownerId: valid().sub,
        schedule: { ...intakeSchedule, startDate: istanbulDate(new Date(Date.parse(dueAt) - 1)) },
      }),
    }),
    { DB: await worker.getD1Database('DB'), MEDICINES_WORKER_SECRET: workerSecret },
  )
  assert.equal(seed.status, 200)
  const intake = {
    scheduleId: intakeSchedule.id,
    dueAt,
    takenAt: new Date().toISOString(),
    quantity: 1,
    ownerId: 'google:bob',
  }
  const markTaken = (headers: Record<string, string>, origin = base, body: unknown = intake) =>
    request('/api/schedules', {
      method: 'PUT',
      headers: { ...headers, origin, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
  assert.equal((await markTaken({})).status, 401)
  assert.equal((await markTaken(alice, 'https://other.example')).status, 403)
  assert.equal((await markTaken(bob)).status, 400)
  const taken = await markTaken(alice)
  assert.equal(taken.status, 200)
  assert.match(taken.headers.get('cache-control')!, /no-store/)
  const correction: DoseCorrectionInput = {
    actionId: 'cb7169e8-6e81-4f61-b981-ff7448ae01aa',
    scheduleId: intake.scheduleId,
    dueAt: intake.dueAt,
    expectedRevision: 0,
    expectedOutcome: 'Taken',
    outcome: 'Skipped',
  }
  const correct = (headers: Record<string, string>, origin = base, body: unknown = correction) =>
    request('/api/schedules', {
      method: 'PATCH',
      headers: { ...headers, origin, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
  assert.equal((await correct({})).status, 401)
  assert.equal((await correct(alice, 'https://other.example')).status, 403)
  const amendment: DoseCorrectionInput = {
    ...correction,
    actionId: 'f8f3755e-4e37-492f-80e9-9c6e036da98b',
    takenAt: new Date(Date.parse(dueAt) - 15 * 60_000).toISOString(),
    quantity: 1,
    outcome: 'Taken',
  }
  const amendedResponse = await correct(alice, base, amendment)
  assert.equal(amendedResponse.status, 200)
  const amended = await amendedResponse.json()
  assert.equal(amended.record.takenAt, amendment.takenAt)
  assert.equal((await correct(alice, base, { ...amendment, quantity: 2 })).status, 409)
  assert.equal(
    (
      await correct(alice, base, {
        ...amendment,
        actionId: '7b00f7aa-8249-4fd2-bdae-96ec8081a0ce',
        expectedRevision: 0,
      })
    ).status,
    409,
  )
  assert.equal((await correct(bob, base, amendment)).status, 400)
  assert.equal(
    (
      await correct(alice, base, {
        ...amendment,
        actionId: '009aaa6c-7e64-47a6-9e1f-431218960248',
        takenAt: new Date(Date.now() + 60_000).toISOString(),
        expectedRevision: 1,
      })
    ).status,
    400,
  )
  assert.equal(
    (
      await correct(alice, base, {
        ...amendment,
        actionId: '0e9aace9-8c24-4fd0-b401-4258806b4357',
        quantity: 0.5,
        expectedRevision: 1,
      })
    ).status,
    400,
  )
  const flipToSkipped = { ...correction, expectedRevision: 1 }
  const correctedResponse = await correct(alice, base, flipToSkipped)
  assert.equal(correctedResponse.status, 200)
  const corrected = await correctedResponse.json()
  assert.equal(corrected.record.outcome, 'Skipped')
  const skipDueAt = new Date(`${todayDate}T00:01+03:00`).toISOString()
  const skipInput = {
    outcome: 'Skipped',
    scheduleId: intakeSchedule.id,
    dueAt: skipDueAt,
    ownerId: 'google:bob',
  }
  const markSkipped = (headers: Record<string, string>, body: unknown = skipInput, origin = base) =>
    request('/api/schedules', {
      method: 'PUT',
      headers: { ...headers, origin, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
  assert.equal((await markSkipped({})).status, 401)
  assert.equal((await markSkipped(alice, skipInput, 'https://other.example')).status, 403)
  assert.equal(
    (await markSkipped(alice, { ...skipInput, takenAt: new Date().toISOString() })).status,
    400,
  )
  assert.equal((await markSkipped(bob)).status, 400)
  const skippedResponse = await markSkipped(alice)
  assert.equal(skippedResponse.status, 200)
  const skipped = await skippedResponse.json()
  assert.equal(skipped.record.outcome, 'Skipped')
  assert.equal(skipped.record.scheduleId, intakeSchedule.id)
  assert.equal(
    (
      await markSkipped(alice, {
        outcome: 'Skipped',
        scheduleId: intake.scheduleId,
        dueAt: intake.dueAt,
        ownerId: 'google:bob',
      })
    ).status,
    409,
  )
  assert.equal((await markSkipped(alice, { ...intake, outcome: 'Maybe' })).status, 400)
  const takenOnSkip = await markTaken(alice, base, {
    scheduleId: intakeSchedule.id,
    dueAt: skipDueAt,
    takenAt: new Date().toISOString(),
    quantity: 1,
  })
  assert.equal(takenOnSkip.status, 409)
  const current = await (await request('/api/schedules', { headers: alice })).json()
  const doses: DoseOccurrence[] = current.today.doses
  const currentIntake = doses.find(
    (dose) => dose.scheduleId === intake.scheduleId && dose.dueAt === dueAt,
  )
  assert.equal(currentIntake?.status, 'Skipped')
  assert.equal(currentIntake.record.revision, 2)
  assert.equal(
    doses.find((dose) => dose.scheduleId === intakeSchedule.id && dose.dueAt === skipDueAt)?.status,
    'Skipped',
  )
  const oversized = await save({ ...medicine, label: 'x'.repeat(5000) })
  assert.equal(oversized.status, 413)
  await worker.dispose()
  const unavailable = await save({ ...medicine, id: '8c4ea91b-c9df-4d47-8cd0-54c1892c4e52' })
  assert.equal(unavailable.status, 503)
  assert.deepEqual(await unavailable.json(), { error: 'unavailable' })
  assert.equal((await scheduleSave(alice)).status, 503)
  assert.equal((await markTaken(alice)).status, 503)
  assert.equal((await markSkipped(alice)).status, 503)
})

test('missing private configuration disables sign-in and preserves accessible recovery', async () => {
  child.kill('SIGTERM')
  await once(child, 'exit')
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !key.startsWith('AUTH_')),
  ) as NodeJS.ProcessEnv
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
        AUTH_ALLOWED_EMAILS: ' , ',
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
    assert.match(response.headers.get('cache-control')!, /no-store/)
  }
  assert.equal(
    (await request('/api/session', { headers: { cookie: await cookie(valid()) } })).status,
    401,
  )
  const page = await request('/')
  const html = await page.text()
  assert.match(html, /Sign-in is unavailable right now/)
  assert(!html.includes('Continue with Google'))
})
