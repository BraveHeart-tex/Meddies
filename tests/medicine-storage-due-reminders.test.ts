import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { drizzle } from 'drizzle-orm/d1'
import { beforeAll, test } from 'vitest'
import { saveDeviceRegistration } from '../worker/device-registrations'
import {
  runDueReminders,
  type ProviderAnswer,
  type ReminderMessage,
  type ReminderProvider,
} from '../worker/due-reminders'
import {
  medicine,
  runtime,
  startWorkerRuntime,
  versionFixture,
} from './helpers/medicine-storage-runtime'

// The due-reminder operation on real D1 with controlled time and a fake provider (#366).
// Runs are global, so each case uses its own date and Last day: no other case's Occurrence
// falls inside its +80 minute window.
startWorkerRuntime()

let db: D1Database
beforeAll(async () => {
  db = await runtime.getD1Database('DB')
})

type Answer = (message: ReminderMessage) => ProviderAnswer | Promise<ProviderAnswer>
const accepted: Answer = () => ({ outcome: 'accepted' })
const fake = (answer: Answer = accepted) => {
  const sent: ReminderMessage[] = []
  const provider: ReminderProvider = {
    submit: async (message) => {
      sent.push(message)
      return answer(message)
    },
  }
  return { provider, sent }
}
const run = (provider: ReminderProvider, at: string, batch?: number) =>
  runDueReminders(drizzle(db), provider, () => new Date(at), batch)

/**
 * One owner with a Schedule on `date` only (09:00 Istanbul is 06:00Z), or none without `times`,
 * and `devices` Device registrations.
 */
async function owner(date: string, times: string[], devices = 1) {
  const f = await versionFixture()
  f.setNow(`${date}T04:00:00.000Z`)
  const scheduleId = randomUUID()
  if (times.length)
    await f.operations.save({
      id: scheduleId,
      medicineId: f.medicineId,
      startDate: date,
      endDate: date,
      times: times.map((time) => ({ time, quantity: 1 })),
    })
  const tokens: string[] = []
  for (let index = 0; index < devices; index++) {
    const token = `token-${randomUUID()}`
    tokens.push(token)
    await saveDeviceRegistration(
      drizzle(db),
      f.ownerId,
      { installationId: randomUUID(), token },
      new Date(`${date}T04:00:00.000Z`),
    )
  }
  const due = (time: string) => new Date(`${date}T${time}:00+03:00`).toISOString()
  return { ...f, scheduleId, tokens, due }
}

const reminderState = async (ownerId: string) =>
  (
    await db
      .prepare(
        'SELECT due_at AS dueAt, state FROM original_reminders WHERE owner_id=? ORDER BY due_at',
      )
      .bind(ownerId)
      .all<{ dueAt: string; state: string }>()
  ).results

test('A run at or after the due instant submits one Original reminder per Device registration', async () => {
  const o = await owner('2026-11-10', ['09:00'], 2)
  const bystander = await owner('2026-11-10', [], 1)
  const { provider, sent } = fake()

  assert.deepEqual(await run(provider, '2026-11-10T05:59:59.999Z'), {
    submitted: 0,
    dropped: 0,
    retrying: 0,
  })
  assert.equal(sent.length, 0)

  assert.deepEqual(await run(provider, '2026-11-10T06:00:00.000Z'), {
    submitted: 1,
    dropped: 0,
    retrying: 0,
  })
  const message = { scheduleId: o.scheduleId, dueAt: o.due('09:00') }
  assert.deepEqual(
    sent.toSorted((a, b) => a.token.localeCompare(b.token)),
    o.tokens.toSorted().map((token) => ({ ...message, token })),
  )
  assert.equal(
    sent.some((m) => bystander.tokens.includes(m.token)),
    false,
  )

  await run(provider, '2026-11-10T06:01:00.000Z')
  assert.equal(sent.length, 2, 'a submitted Original reminder is not submitted again')
})

test('A run after due +80 minutes drops the Original reminder without submitting', async () => {
  const atCutoff = await owner('2026-11-11', ['09:00'])
  const pastCutoff = await owner('2026-11-12', ['09:00'])
  const retried = await owner('2026-11-13', ['09:00'])
  const { provider, sent } = fake()

  await run(provider, '2026-11-11T07:20:00.000Z')
  assert.deepEqual(
    sent.map((m) => m.token),
    atCutoff.tokens,
    '+80:00 still submits',
  )

  sent.length = 0
  await run(provider, '2026-11-12T07:20:01.000Z')
  await run(provider, '2026-11-12T07:21:00.000Z')
  assert.equal(sent.length, 0, '+80:01 never submits')

  const failing = fake(() => ({ outcome: 'transient', code: 'UNAVAILABLE' }))
  assert.equal((await run(failing.provider, '2026-11-13T06:00:00.000Z')).retrying, 1)
  await run(provider, '2026-11-13T07:20:01.000Z')
  assert.equal(sent.length, 0, 'a reminder left eligible by a transient failure expires at +80:01')
  assert.deepEqual(await reminderState(retried.ownerId), [
    { dueAt: retried.due('09:00'), state: 'dropped' },
  ])
})

test('An Occurrence with Taken or Skipped recorded gets no Original reminder', async () => {
  const o = await owner('2026-11-14', ['09:00', '09:10', '09:20'])
  const failing = fake(() => ({ outcome: 'transient', code: 'UNAVAILABLE' }))
  await run(failing.provider, '2026-11-14T06:00:00.000Z')
  assert.equal(failing.sent.length, 1)

  o.setNow('2026-11-14T06:05:00.000Z')
  await o.operations.recordSkipped({ scheduleId: o.scheduleId, dueAt: o.due('09:00') })
  await o.operations.recordTaken({
    scheduleId: o.scheduleId,
    dueAt: o.due('09:10'),
    takenAt: '2026-11-14T06:05:00.000Z',
    quantity: 1,
  })

  const { provider, sent } = fake()
  assert.deepEqual(await run(provider, '2026-11-14T06:20:00.000Z'), {
    submitted: 1,
    dropped: 2,
    retrying: 0,
  })
  assert.deepEqual(sent, [{ token: o.tokens[0], scheduleId: o.scheduleId, dueAt: o.due('09:20') }])
})

test('Overlapping runs submit each Original reminder once and an abandoned claim is recovered after its lease', async () => {
  const o = await owner('2026-11-15', ['09:00', '09:30'], 2)
  const { provider, sent } = fake()
  await Promise.all([
    run(provider, '2026-11-15T06:00:00.000Z'),
    run(provider, '2026-11-15T06:00:00.000Z'),
    run(provider, '2026-11-15T06:00:30.000Z'),
  ])
  assert.equal(sent.length, 2, 'one submission per Device registration across overlapping runs')

  // A run claims 09:30 and stalls inside the provider, abandoning its claim.
  let resume!: () => void
  const stalled = new Promise<void>((resolve) => (resume = resolve))
  let reached!: () => void
  const claimedByStalledRun = new Promise<void>((resolve) => (reached = resolve))
  const stalling = fake(async () => {
    reached()
    await stalled
    return { outcome: 'accepted' }
  })
  const abandoned = run(stalling.provider, '2026-11-15T06:30:00.000Z')
  await claimedByStalledRun

  sent.length = 0
  await run(provider, '2026-11-15T06:34:59.999Z')
  assert.equal(sent.length, 0, 'a leased claim is not taken by another run')

  assert.deepEqual(await run(provider, '2026-11-15T06:35:00.000Z'), {
    submitted: 1,
    dropped: 0,
    retrying: 0,
  })
  assert.equal(sent.length, 2, 'the expired lease is reclaimed and submitted')

  resume()
  assert.deepEqual(await abandoned, { submitted: 0, dropped: 0, retrying: 0 })
  await run(provider, '2026-11-15T06:40:00.000Z')
  assert.equal(sent.length, 2)
  assert.deepEqual(await reminderState(o.ownerId), [
    { dueAt: o.due('09:00'), state: 'submitted' },
    { dueAt: o.due('09:30'), state: 'submitted' },
  ])
})

test('Each submission records a Delivery attempt with the provider answer and no token or medication name', async () => {
  const o = await owner('2026-11-16', ['09:00'], 3)
  const [acceptedToken, rejectedToken, failingToken] = o.tokens
  const answers = fake((message) => {
    if (message.token === rejectedToken) return { outcome: 'rejected', code: 'UNREGISTERED' }
    if (message.token === failingToken) throw new Error(`provider echoed ${failingToken}`)
    return { outcome: 'accepted' }
  })
  assert.equal((await run(answers.provider, '2026-11-16T06:00:00.000Z')).retrying, 1)
  assert.equal(answers.sent.length, 3)

  const retry = fake()
  assert.equal((await run(retry.provider, '2026-11-16T06:01:00.000Z')).submitted, 1)
  assert.deepEqual(
    retry.sent.map((m) => m.token),
    [failingToken],
    'only the transient Device registration is submitted again',
  )

  const attempts = (
    await db
      .prepare('SELECT * FROM delivery_attempts WHERE owner_id=? ORDER BY attempted_at, outcome')
      .bind(o.ownerId)
      .all<Record<string, unknown>>()
  ).results
  const installations = (
    await db
      .prepare('SELECT installation_id AS id, token FROM device_registrations WHERE owner_id=?')
      .bind(o.ownerId)
      .all<{ id: string; token: string }>()
  ).results
  const installation = (token: string) => installations.find((row) => row.token === token)!.id
  const occurrence = { owner_id: o.ownerId, schedule_id: o.scheduleId, due_at: o.due('09:00') }
  assert.deepEqual(
    attempts.map(({ id, ...row }) => (assert.ok(id), row)),
    [
      {
        ...occurrence,
        installation_id: installation(acceptedToken),
        outcome: 'accepted',
        code: null,
        attempted_at: '2026-11-16T06:00:00.000Z',
      },
      {
        ...occurrence,
        installation_id: installation(rejectedToken),
        outcome: 'rejected',
        code: 'UNREGISTERED',
        attempted_at: '2026-11-16T06:00:00.000Z',
      },
      {
        ...occurrence,
        installation_id: installation(failingToken),
        outcome: 'transient',
        code: 'ERROR',
        attempted_at: '2026-11-16T06:00:00.000Z',
      },
      {
        ...occurrence,
        installation_id: installation(failingToken),
        outcome: 'accepted',
        code: null,
        attempted_at: '2026-11-16T06:01:00.000Z',
      },
    ].toSorted(
      (a, b) => a.attempted_at.localeCompare(b.attempted_at) || a.outcome.localeCompare(b.outcome),
    ),
  )
  const stored = JSON.stringify(attempts)
  for (const token of o.tokens) assert.equal(stored.includes(token), false)
  assert.equal(stored.includes(medicine.label), false)
})

test('A run processes a bounded batch and leaves the rest for the next run', async () => {
  const o = await owner('2026-11-17', ['09:00', '09:10', '09:20'])
  const { provider, sent } = fake()
  assert.equal((await run(provider, '2026-11-17T06:30:00.000Z', 2)).submitted, 2)
  assert.deepEqual(
    sent.map((m) => m.dueAt),
    [o.due('09:00'), o.due('09:10')],
  )
  assert.equal((await run(provider, '2026-11-17T06:31:00.000Z', 2)).submitted, 1)
  assert.deepEqual(sent.at(-1)?.dueAt, o.due('09:20'))
})
