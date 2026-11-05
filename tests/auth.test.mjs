import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { createServer } from 'node:net'
import { setTimeout as delay } from 'node:timers/promises'
import { after, before, test } from 'node:test'
import { encode } from 'next-auth/jwt'
import { readFile } from 'node:fs/promises'
import { createWorker } from '../worker/index.ts'
import { istanbulDate } from '../src/features/schedules/contract.ts'
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
  for (const statement of (await readFile('worker/migrations/0003_dose_records.sql', 'utf8')).split(
    ';',
  )) {
    if (statement.trim()) await db.exec(statement.trim().replaceAll('\n', ' '))
  }
  const migration = await readFile('worker/migrations/0004_skipped_dose_records.sql', 'utf8')
  const triggers = [...migration.matchAll(/CREATE TRIGGER[\s\S]*?END;/g)].map(
    ([statement]) => statement,
  )
  const baseStatements = migration.replace(/CREATE TRIGGER[\s\S]*?END;/g, '').split(';')
  for (const statement of [...baseStatements, ...triggers])
    if (statement.trim()) await db.exec(statement.trim().replaceAll('\n', ' '))
  await db.exec(
    (await readFile('worker/migrations/0005_dose_corrections.sql', 'utf8')).replaceAll('\n', ' '),
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
  const intakeMedicine = {
    ...medicine,
    id: '3b57b05e-6d43-4c7a-9da8-16d9f1d36c11',
    label: 'Intake fixture',
    unit: 'capsule',
  }
  assert.equal((await save(intakeMedicine)).status, 200)
  const todayDate = istanbulDate(new Date())
  const intakeSchedule = {
    ...schedule,
    id: '6cc12abe-66bc-486b-8ed5-7264979c926f',
    medicineId: intakeMedicine.id,
    startDate: todayDate,
    times: [{ time: '00:00', quantity: 1 }],
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
    ownerId: valid().sub,
  }
  const markTaken = (headers, origin = base, body = intake) =>
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
  assert.match(taken.headers.get('cache-control'), /no-store/)
  const recorded = await taken.json()
  assert.deepEqual(await (await markTaken(alice)).json(), recorded)
  const correction = {
    actionId: 'cb7169e8-6e81-4f61-b981-ff7448ae01aa',
    scheduleId: intake.scheduleId,
    dueAt: intake.dueAt,
    expectedRevision: 0,
    expectedOutcome: 'Taken',
    outcome: 'Skipped',
  }
  const correct = (headers, origin = base, body = correction) =>
    request('/api/schedules', {
      method: 'PATCH',
      headers: { ...headers, origin, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
  assert.equal((await correct({})).status, 401)
  assert.equal((await correct(alice, 'https://other.example')).status, 403)
  const amendment = {
    ...correction,
    actionId: 'f8f3755e-4e37-492f-80e9-9c6e036da98b',
    takenAt: new Date(Date.parse(dueAt) - 15 * 60_000).toISOString(),
    quantity: 1,
    outcome: 'Taken',
  }
  const amendedResponse = await correct(alice, base, amendment)
  assert.equal(amendedResponse.status, 200)
  const amended = await amendedResponse.json()
  assert.equal(amended.record.outcome, 'Taken')
  assert.equal(amended.record.revision, 1)
  assert.equal(amended.record.takenAt, amendment.takenAt)
  assert.equal(amended.record.quantity, 1)
  assert.deepEqual(await (await correct(alice, base, amendment)).json(), amended)
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
  const unchangedSchedule = await (await request('/api/schedules', { headers: alice })).json()
  assert.equal(
    unchangedSchedule.schedules.find((entry) => entry.id === intakeSchedule.id).times[0].quantity,
    1,
  )
  const flipToSkipped = { ...correction, expectedRevision: 1 }
  const correctedResponse = await correct(alice, base, flipToSkipped)
  assert.equal(correctedResponse.status, 200)
  const corrected = await correctedResponse.json()
  assert.equal(corrected.record.outcome, 'Skipped')
  assert.equal(corrected.record.revision, 2)
  assert.deepEqual(await (await correct(alice, base, flipToSkipped)).json(), corrected)
  const skipMedicine = {
    ...intakeMedicine,
    id: '9c2c50d8-c9e9-4635-90da-28f5c6ea177a',
    label: 'Skip fixture',
  }
  assert.equal((await save(skipMedicine)).status, 200)
  const skipSchedule = {
    ...intakeSchedule,
    id: 'a5b79faa-72fd-42d1-8d31-5f3ae41652b4',
    medicineId: skipMedicine.id,
    times: [{ time: '00:01', quantity: 1 }],
  }
  const skipDueAt = new Date(`${todayDate}T00:01+03:00`).toISOString()
  const skipSeed = await createWorker(() => new Date(Date.parse(skipDueAt) - 1)).fetch(
    new Request('http://worker/schedules', {
      method: 'POST',
      headers: { authorization: `Bearer ${workerSecret}` },
      body: JSON.stringify({
        operation: 'save',
        ownerId: valid().sub,
        schedule: {
          ...skipSchedule,
          startDate: istanbulDate(new Date(Date.parse(skipDueAt) - 1)),
        },
      }),
    }),
    { DB: await worker.getD1Database('DB'), MEDICINES_WORKER_SECRET: workerSecret },
  )
  assert.equal(skipSeed.status, 200)
  const skipInput = {
    outcome: 'Skipped',
    scheduleId: skipSchedule.id,
    dueAt: skipDueAt,
    ownerId: 'google:bob',
  }
  const markSkipped = (headers, body = skipInput, origin = base) =>
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
  assert.equal(skipped.record.scheduleId, skipSchedule.id)
  assert.deepEqual(await (await markSkipped(alice)).json(), skipped)
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
  assert.equal((await markSkipped(alice, { ...intake, outcome: 'Skipped' })).status, 400)
  const takenOnSkip = await markTaken(alice, base, {
    scheduleId: skipSchedule.id,
    dueAt: skipDueAt,
    takenAt: new Date().toISOString(),
    quantity: 1,
  })
  assert.equal(takenOnSkip.status, 409)
  const current = await (await request('/api/schedules', { headers: alice })).json()
  const currentIntake = current.today.doses.find((dose) => dose.scheduleId === intake.scheduleId)
  assert.equal(currentIntake?.status, 'Skipped')
  assert.equal(currentIntake?.record.revision, 2)
  assert.equal(
    current.today.doses.find((dose) => dose.scheduleId === skipSchedule.id)?.status,
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
