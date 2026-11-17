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
import { createWorker } from '../worker/index'
import {
  call,
  medicine,
  runtime,
  secret,
  startWorkerRuntime,
  versionFixture,
} from './helpers/medicine-storage-runtime'

// The due-reminder operation on real D1 with controlled time and a fake provider (#366, #31).
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

async function anotherMedicine(ownerId: string) {
  const id = randomUUID()
  const saved = await call({ operation: 'save', ownerId, medicine: { ...medicine, id } })
  assert.equal(saved.status, 200)
  return id
}

/** Saves one Schedule of `medicineId` with `times` on `date` only. */
async function schedule(
  o: Awaited<ReturnType<typeof owner>>,
  date: string,
  medicineId: string,
  times: string[],
) {
  const id = randomUUID()
  await o.operations.save({
    id,
    medicineId,
    startDate: date,
    endDate: date,
    times: times.map((time) => ({ time, quantity: 1 })),
  })
  return id
}

/**
 * One owner with `schedules` Schedules per time on `date` only (09:00 Istanbul is 06:00Z), each for
 * its own medication so no newer Occurrence suppresses another's reminders (#34), and `devices`
 * Device registrations. `ids(time)` names a time's Schedules, sorted; `scheduleId` the first one of
 * the first time.
 */
async function owner(date: string, times: string[], devices = 1, schedules = 1) {
  const f = await versionFixture()
  f.setNow(`${date}T04:00:00.000Z`)
  const slots = times.flatMap((time) =>
    Array.from({ length: schedules }, () => ({ time, id: randomUUID() })),
  )
  for (const [index, { time, id }] of slots.entries()) {
    const medicineId = index ? await anotherMedicine(f.ownerId) : f.medicineId
    await f.operations.save({
      id,
      medicineId,
      startDate: date,
      endDate: date,
      times: [{ time, quantity: 1 }],
    })
  }
  const ids = (time: string) =>
    slots
      .filter((slot) => slot.time === time)
      .map((slot) => slot.id)
      .toSorted()
  const scheduleId = slots[0]?.id
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
  return { ...f, scheduleId, ids, scheduleIds: ids(times[0]), tokens, due }
}

const registrations = async (ownerId: string) =>
  (
    await db
      .prepare('SELECT installation_id AS id, token FROM device_registrations WHERE owner_id=?')
      .bind(ownerId)
      .all<{ id: string; token: string }>()
  ).results

const followUpState = async (ownerId: string) =>
  (
    await db
      .prepare(
        'SELECT reminder, state FROM follow_up_reminders WHERE owner_id=? ORDER BY due_at, reminder',
      )
      .bind(ownerId)
      .all<{ reminder: number; state: string }>()
  ).results

/** What `sent` held: each message as `<due instant> #<reminder> x<doses>`, sorted. */
const summary = (sent: ReminderMessage[]) =>
  sent.map((m) => `${m.dueAt} #${m.reminder} x${m.scheduleIds.length}`).toSorted()

const reminderState = async (ownerId: string) =>
  (
    await db
      .prepare(
        'SELECT due_at AS dueAt, state FROM original_reminders WHERE owner_id=? ORDER BY due_at',
      )
      .bind(ownerId)
      .all<{ dueAt: string; state: string }>()
  ).results

/** The claim token on `table`'s rows due at `dueAt`, read while a run is mid-flight. */
const claimTokens = async (table: string, ownerId: string, dueAt: string) =>
  (
    await db
      .prepare(`SELECT claim_token AS token FROM ${table} WHERE owner_id=? AND due_at=?`)
      .bind(ownerId, dueAt)
      .all<{ token: string | null }>()
  ).results.map((row) => row.token)

const attemptedSchedules = async (ownerId: string, dueAt: string, reminder: number) =>
  (
    await db
      .prepare(
        'SELECT schedule_id AS scheduleId FROM delivery_attempts WHERE owner_id=? AND due_at=? AND reminder=?',
      )
      .bind(ownerId, dueAt, reminder)
      .all<{ scheduleId: string }>()
  ).results.map((row) => row.scheduleId)

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
  const message = { dueAt: o.due('09:00'), reminder: 0, scheduleIds: [o.scheduleId] }
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

test('A late run submits only the latest reminder due by then, through due +80 minutes inclusive', async () => {
  const atCutoff = await owner('2026-11-11', ['09:00'])
  const pastCutoff = await owner('2026-11-12', ['09:00'])
  const delayed = await owner('2026-11-13', ['09:00'])
  const { provider, sent } = fake()

  // Delayed recovery: first check 10:05.
  assert.deepEqual(await run(provider, '2026-11-13T07:05:00.000Z'), {
    submitted: 1,
    dropped: 0,
    retrying: 0,
  })
  assert.deepEqual(
    summary(sent),
    [`${delayed.due('09:00')} #1 x1`],
    'only the 09:40 Follow-up reminder',
  )
  await run(provider, '2026-11-13T07:19:00.000Z')
  await run(provider, '2026-11-13T07:20:00.000Z')
  assert.deepEqual(
    summary(sent),
    [`${delayed.due('09:00')} #1 x1`, `${delayed.due('09:00')} #2 x1`],
    'the 10:20 one stays',
  )
  assert.deepEqual(await reminderState(delayed.ownerId), [], 'the Original reminder is never sent')

  // Exact automatic cutoff: first check 10:20.
  sent.length = 0
  await run(provider, '2026-11-11T07:20:00.000Z')
  await run(provider, '2026-11-11T07:21:00.000Z')
  assert.deepEqual(summary(sent), [`${atCutoff.due('09:00')} #2 x1`])
  assert.deepEqual(await followUpState(atCutoff.ownerId), [{ reminder: 2, state: 'submitted' }])

  // Past automatic cutoff: first check 10:20:01.
  sent.length = 0
  await run(provider, '2026-11-12T07:20:01.000Z')
  await run(provider, '2026-11-12T07:21:00.000Z')
  assert.equal(sent.length, 0, '+80:01 never submits')
  assert.deepEqual(await reminderState(pastCutoff.ownerId), [])
  assert.deepEqual(await followUpState(pastCutoff.ownerId), [])
})

test('An Occurrence without Taken or Skipped gets Follow-up reminders at due +40 and +80 minutes on each Device registration', async () => {
  const o = await owner('2026-11-26', ['09:00'], 2)
  const { provider, sent } = fake()
  const runs = []
  for (const at of ['06:00', '06:39', '06:40', '06:41', '07:19', '07:20:00.400', '07:21', '07:40'])
    runs.push(await run(provider, `2026-11-26T${at.length === 5 ? `${at}:00.000` : at}Z`))
  assert.deepEqual(
    runs.map((result) => result.submitted),
    [1, 0, 1, 0, 0, 1, 0, 0],
    'a run part way into 10:20:00 still counts as 10:20',
  )
  assert.deepEqual(
    sent.map((m) => [m.token, m.dueAt, m.reminder, m.scheduleIds]).toSorted(),
    o.tokens
      .flatMap((token) =>
        [0, 1, 2].map((reminder) => [token, o.due('09:00'), reminder, [o.scheduleId]]),
      )
      .toSorted(),
  )
  const attempts = (
    await db
      .prepare('SELECT reminder, attempted_at AS at FROM delivery_attempts WHERE owner_id=?')
      .bind(o.ownerId)
      .all<{ reminder: number; at: string }>()
  ).results
  assert.deepEqual(
    attempts.map((row) => `${row.reminder} ${row.at}`).toSorted(),
    [
      '0 2026-11-26T06:00:00.000Z',
      '0 2026-11-26T06:00:00.000Z',
      '1 2026-11-26T06:40:00.000Z',
      '1 2026-11-26T06:40:00.000Z',
      '2 2026-11-26T07:20:00.000Z',
      '2 2026-11-26T07:20:00.000Z',
    ],
    'each Delivery attempt names the reminder it submitted',
  )
})

test('Taken or Skipped recorded before a Follow-up reminder runs stops it', async () => {
  const o = await owner('2026-11-27', ['09:00', '09:10'])
  const { provider, sent } = fake()
  await run(provider, '2026-11-27T06:00:00.000Z')
  await run(provider, '2026-11-27T06:10:00.000Z')
  assert.equal(sent.length, 2)

  o.setNow('2026-11-27T06:15:00.000Z')
  await o.operations.recordSkipped({ scheduleId: o.ids('09:00')[0], dueAt: o.due('09:00') })
  await o.operations.recordTaken({
    scheduleId: o.ids('09:10')[0],
    dueAt: o.due('09:10'),
    takenAt: '2026-11-27T06:15:00.000Z',
    quantity: 1,
  })

  const runs = []
  for (const at of ['06:40', '06:50', '07:20', '07:30'])
    runs.push(await run(provider, `2026-11-27T${at}:00.000Z`))
  assert.deepEqual(runs, Array(4).fill({ submitted: 0, dropped: 1, retrying: 0 }))
  assert.equal(sent.length, 2, 'no Follow-up reminder is submitted')
})

// #32: two Occurrences share 09:00 and two 09:10; Skipped for one at 09:10 arrives while the run
// submits the 09:00 Follow-up reminder, after both instants are claimed.
test('Taken or Skipped recorded after a run claims a Follow-up reminder leaves only the other Occurrence in it', async () => {
  const o = await owner('2026-12-05', ['09:00', '09:10'], 1, 2)
  const [stopped, left] = o.ids('09:10')
  const { provider, sent } = fake()
  await run(provider, '2026-12-05T06:00:00.000Z')
  await run(provider, '2026-12-05T06:10:00.000Z')
  sent.length = 0

  const claimedBeforeOutcome: (string | null)[] = []
  const midRun = fake(async (message) => {
    if (message.dueAt !== o.due('09:00')) return { outcome: 'accepted' }
    claimedBeforeOutcome.push(
      ...(await claimTokens('follow_up_reminders', o.ownerId, o.due('09:10'))),
    )
    o.setNow('2026-12-05T06:50:00.000Z')
    await o.operations.recordSkipped({ scheduleId: stopped, dueAt: o.due('09:10') })
    return { outcome: 'accepted' }
  })
  assert.deepEqual(await run(midRun.provider, '2026-12-05T06:50:00.000Z'), {
    submitted: 3,
    dropped: 1,
    retrying: 0,
  })
  assert.equal(claimedBeforeOutcome.length, 2)
  assert.ok(
    claimedBeforeOutcome.every(Boolean),
    'the 09:10 Follow-up reminders were claimed before the outcome arrived',
  )
  assert.deepEqual(midRun.sent, [
    { token: o.tokens[0], dueAt: o.due('09:00'), reminder: 1, scheduleIds: o.ids('09:00') },
    { token: o.tokens[0], dueAt: o.due('09:10'), reminder: 1, scheduleIds: [left] },
  ])
  assert.deepEqual(await attemptedSchedules(o.ownerId, o.due('09:10'), 1), [left])
  const states = (
    await db
      .prepare(
        'SELECT schedule_id AS scheduleId, state FROM follow_up_reminders WHERE owner_id=? AND due_at=? ORDER BY schedule_id',
      )
      .bind(o.ownerId, o.due('09:10'))
      .all<{ scheduleId: string; state: string }>()
  ).results
  assert.deepEqual(states, [
    { scheduleId: stopped, state: 'dropped' },
    { scheduleId: left, state: 'submitted' },
  ])
})

test('Transient answers, overlapping runs and retired reminders never add a Follow-up reminder or submit one twice to a Device registration', async () => {
  const o = await owner('2026-11-28', ['09:00'], 2)
  const [flaky, steady] = o.tokens
  const { provider, sent } = fake()
  const transient: ProviderAnswer = { outcome: 'transient', code: 'UNAVAILABLE' }

  // The Original reminder is left eligible by transient answers, then retired at +40.
  const failing = fake(() => transient)
  assert.equal((await run(failing.provider, '2026-11-28T06:00:00.000Z')).retrying, 1)

  // Overlapping runs at +40, with one transient answer for the first Follow-up reminder.
  let flakyOnce = true
  const overlapping = fake((message) => {
    if (message.token !== flaky || !flakyOnce) return { outcome: 'accepted' }
    flakyOnce = false
    return transient
  })
  await Promise.all([
    run(overlapping.provider, '2026-11-28T06:40:00.000Z'),
    run(overlapping.provider, '2026-11-28T06:40:00.000Z'),
    run(overlapping.provider, '2026-11-28T06:40:30.000Z'),
  ])
  assert.deepEqual(
    overlapping.sent.map((m) => `${m.token} #${m.reminder}`).toSorted(),
    [`${flaky} #1`, `${steady} #1`].toSorted(),
    'overlapping runs submit the first Follow-up reminder once per Device registration',
  )
  await run(provider, '2026-11-28T06:41:00.000Z')
  await run(provider, '2026-11-28T06:42:00.000Z')
  await run(provider, '2026-11-28T07:19:00.000Z')
  assert.deepEqual(
    sent.map((m) => `${m.token} #${m.reminder}`),
    [`${flaky} #1`],
    'the transient answer is retried to its Device registration only',
  )

  // A run claims the second Follow-up reminder and stalls inside the provider.
  let resume!: () => void
  const stalled = new Promise<void>((resolve) => (resume = resolve))
  let reached!: () => void
  const claimedByStalledRun = new Promise<void>((resolve) => (reached = resolve))
  const stalling = fake(async () => {
    reached()
    await stalled
    return { outcome: 'accepted' }
  })
  const abandoned = run(stalling.provider, '2026-11-28T07:20:00.000Z')
  await claimedByStalledRun
  await run(provider, '2026-11-28T07:20:00.000Z')
  assert.deepEqual(await run(provider, '2026-11-28T07:25:00.000Z'), {
    submitted: 0,
    dropped: 0,
    retrying: 0,
  })
  resume()
  await abandoned
  for (const at of ['07:26', '07:40', '08:00']) await run(provider, `2026-11-28T${at}:00.000Z`)

  assert.deepEqual(
    [...failing.sent, ...overlapping.sent, ...sent, ...stalling.sent]
      .map((m) => `${m.token} #${m.reminder}`)
      .toSorted(),
    [
      `${flaky} #0`,
      `${steady} #0`,
      `${flaky} #1`,
      `${flaky} #1`,
      `${steady} #1`,
      `${flaky} #2`,
      `${steady} #2`,
    ].toSorted(),
    'no third Follow-up reminder; a lapsed claim past +80 is dropped, not submitted again',
  )
  assert.deepEqual(await reminderState(o.ownerId), [{ dueAt: o.due('09:00'), state: 'dropped' }])
  assert.deepEqual(await followUpState(o.ownerId), [
    { reminder: 1, state: 'submitted' },
    { reminder: 2, state: 'dropped' },
  ])
})

test('Follow-up reminders of Occurrences sharing a due instant go out as one submission per Device registration, never with another instant', async () => {
  const o = await owner('2026-11-29', ['09:00', '09:40'], 2, 3)
  const { provider, sent } = fake()
  await run(provider, '2026-11-29T06:00:00.000Z')
  sent.length = 0
  assert.deepEqual(await run(provider, '2026-11-29T06:40:00.000Z'), {
    submitted: 6,
    dropped: 0,
    retrying: 0,
  })
  assert.deepEqual(
    sent.map((m) => [m.token, m.dueAt, m.reminder, m.scheduleIds]).toSorted(),
    o.tokens
      .flatMap((token) => [
        [token, o.due('09:00'), 1, o.ids('09:00')],
        [token, o.due('09:40'), 0, o.ids('09:40')],
      ])
      .toSorted(),
    "the 09:40 Original reminders never share the 09:00 Follow-up reminders' push",
  )
  const attempts = (
    await db
      .prepare(
        'SELECT schedule_id AS scheduleId, installation_id AS installationId FROM delivery_attempts WHERE owner_id=? AND due_at=? AND reminder=1',
      )
      .bind(o.ownerId, o.due('09:00'))
      .all<Record<string, string>>()
  ).results
  const installations = (await registrations(o.ownerId)).map((row) => row.id)
  assert.deepEqual(
    attempts.map((row) => `${row.scheduleId} ${row.installationId}`).toSorted(),
    o
      .ids('09:00')
      .flatMap((scheduleId) => installations.map((id) => `${scheduleId} ${id}`))
      .toSorted(),
    'a Delivery attempt per Occurrence and Device registration',
  )
})

test('An Occurrence with Taken or Skipped recorded gets no Original reminder', async () => {
  const o = await owner('2026-11-14', ['09:00', '09:10', '09:20'])
  const failing = fake(() => ({ outcome: 'transient', code: 'UNAVAILABLE' }))
  await run(failing.provider, '2026-11-14T06:00:00.000Z')
  assert.equal(failing.sent.length, 1)

  o.setNow('2026-11-14T06:05:00.000Z')
  await o.operations.recordSkipped({ scheduleId: o.ids('09:00')[0], dueAt: o.due('09:00') })
  await o.operations.recordTaken({
    scheduleId: o.ids('09:10')[0],
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
  assert.deepEqual(sent, [
    { token: o.tokens[0], dueAt: o.due('09:20'), reminder: 0, scheduleIds: o.ids('09:20') },
  ])
})

// #32: the recheck runs per due instant after the claim, so an outcome that reaches the server
// while the run submits an earlier instant still stops a later claimed one.
test('Taken or Skipped recorded after a run claims an Original reminder stops it, dropped with no Delivery attempt', async () => {
  const o = await owner('2026-12-04', ['09:00', '09:10', '09:20'])
  const claimedBeforeOutcome: (string | null)[] = []
  const { provider, sent } = fake(async (message) => {
    if (message.dueAt !== o.due('09:00')) return { outcome: 'accepted' }
    claimedBeforeOutcome.push(
      ...(await claimTokens('original_reminders', o.ownerId, o.due('09:10'))),
      ...(await claimTokens('original_reminders', o.ownerId, o.due('09:20'))),
    )
    o.setNow('2026-12-04T06:20:00.000Z')
    await o.operations.recordSkipped({ scheduleId: o.ids('09:10')[0], dueAt: o.due('09:10') })
    await o.operations.recordTaken({
      scheduleId: o.ids('09:20')[0],
      dueAt: o.due('09:20'),
      takenAt: '2026-12-04T06:20:00.000Z',
      quantity: 1,
    })
    return { outcome: 'accepted' }
  })

  assert.deepEqual(await run(provider, '2026-12-04T06:20:00.000Z'), {
    submitted: 1,
    dropped: 2,
    retrying: 0,
  })
  assert.equal(claimedBeforeOutcome.length, 2)
  assert.ok(
    claimedBeforeOutcome.every(Boolean),
    'the later instants were claimed before the outcome arrived',
  )
  assert.deepEqual(summary(sent), [`${o.due('09:00')} #0 x1`])
  assert.deepEqual(await reminderState(o.ownerId), [
    { dueAt: o.due('09:00'), state: 'submitted' },
    { dueAt: o.due('09:10'), state: 'dropped' },
    { dueAt: o.due('09:20'), state: 'dropped' },
  ])
  for (const time of ['09:10', '09:20'])
    assert.deepEqual(
      await attemptedSchedules(o.ownerId, o.due(time), 0),
      [],
      `no attempt at ${time}`,
    )
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
  await run(provider, '2026-11-15T06:39:00.000Z')
  assert.equal(sent.length, 2)
  assert.deepEqual(await reminderState(o.ownerId), [
    { dueAt: o.due('09:00'), state: 'submitted' },
    { dueAt: o.due('09:30'), state: 'submitted' },
  ])
})

test('Each submission records a Delivery attempt with the provider answer and no token or medication name', async () => {
  const o = await owner('2026-11-16', ['09:00'], 3)
  const [acceptedToken, rejectedToken, failingToken] = o.tokens
  const installations = await registrations(o.ownerId)
  const installation = (token: string) => installations.find((row) => row.token === token)!.id
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
  const occurrence = {
    owner_id: o.ownerId,
    schedule_id: o.scheduleId,
    due_at: o.due('09:00'),
    reminder: 0,
  }
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

test('An UNREGISTERED or NOT_FOUND answer removes that Device registration unless it was renewed', async () => {
  const o = await owner('2026-11-18', ['09:00'], 5)
  const [unregistered, notFound, invalid, renewed, kept] = o.tokens
  const renewedId = (await registrations(o.ownerId)).find((row) => row.token === renewed)!.id
  const answers = fake(async (message) => {
    if (message.token === unregistered) return { outcome: 'rejected', code: 'UNREGISTERED' }
    if (message.token === notFound) return { outcome: 'rejected', code: 'NOT_FOUND' }
    if (message.token === invalid) return { outcome: 'rejected', code: 'INVALID_ARGUMENT' }
    if (message.token === renewed) {
      // The device renews its token while the stale one is being submitted.
      await saveDeviceRegistration(
        drizzle(db),
        o.ownerId,
        { installationId: renewedId, token: 'token-renewed' },
        new Date('2026-11-18T06:00:00.000Z'),
      )
      return { outcome: 'rejected', code: 'UNREGISTERED' }
    }
    return { outcome: 'accepted' }
  })
  assert.equal((await run(answers.provider, '2026-11-18T06:00:00.000Z')).submitted, 1)

  assert.deepEqual(
    (await registrations(o.ownerId)).map((row) => row.token).toSorted(),
    [invalid, 'token-renewed', kept].toSorted(),
  )
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

test('Doses due at the same instant go out as one submission per Device registration, with a Delivery attempt per Occurrence', async () => {
  const o = await owner('2026-11-23', ['09:00'], 2, 3)
  const [failingToken, acceptedToken] = o.tokens
  const installations = await registrations(o.ownerId)
  const installation = (token: string) => installations.find((row) => row.token === token)!.id
  const answers = fake((message) =>
    message.token === failingToken
      ? { outcome: 'transient', code: 'UNAVAILABLE' }
      : { outcome: 'accepted' },
  )
  assert.deepEqual(await run(answers.provider, '2026-11-23T06:00:00.000Z'), {
    submitted: 0,
    dropped: 0,
    retrying: 3,
  })
  const message = { dueAt: o.due('09:00'), reminder: 0, scheduleIds: o.scheduleIds }
  assert.deepEqual(
    answers.sent.toSorted((a, b) => a.token.localeCompare(b.token)),
    o.tokens.toSorted().map((token) => ({ ...message, token })),
    'one submission per Device registration covering every dose due at the instant',
  )

  const retry = fake()
  assert.deepEqual(await run(retry.provider, '2026-11-23T06:01:00.000Z'), {
    submitted: 3,
    dropped: 0,
    retrying: 0,
  })
  assert.deepEqual(
    retry.sent,
    [{ ...message, token: failingToken }],
    'the group is retried only to the Device registration without a final answer',
  )

  const attempts = (
    await db
      .prepare(
        'SELECT schedule_id AS scheduleId, installation_id AS installationId, outcome, attempted_at AS attemptedAt FROM delivery_attempts WHERE owner_id=?',
      )
      .bind(o.ownerId)
      .all<Record<string, string>>()
  ).results
  const key = (row: Record<string, string>) => Object.values(row).join()
  const expected = o.scheduleIds.flatMap((scheduleId) => [
    {
      scheduleId,
      installationId: installation(acceptedToken),
      outcome: 'accepted',
      attemptedAt: '2026-11-23T06:00:00.000Z',
    },
    {
      scheduleId,
      installationId: installation(failingToken),
      outcome: 'transient',
      attemptedAt: '2026-11-23T06:00:00.000Z',
    },
    {
      scheduleId,
      installationId: installation(failingToken),
      outcome: 'accepted',
      attemptedAt: '2026-11-23T06:01:00.000Z',
    },
  ])
  assert.deepEqual(
    attempts.map(key).toSorted(),
    expected.map(key).toSorted(),
    'each covered Occurrence records the submission answer per Device registration',
  )
})

test("Overlapping runs and a batch limit never split one owner's due instant", async () => {
  const o = await owner('2026-11-24', ['09:00', '09:10'], 1, 3)
  const { provider, sent } = fake()
  const runs = await Promise.all([
    run(provider, '2026-11-24T06:10:00.000Z', 1),
    run(provider, '2026-11-24T06:10:00.000Z', 1),
    run(provider, '2026-11-24T06:10:00.000Z', 1),
  ])
  assert.equal(
    runs.reduce((total, result) => total + result.submitted, 0),
    6,
  )
  assert.deepEqual(
    sent.toSorted((a, b) => a.dueAt.localeCompare(b.dueAt)),
    ['09:00', '09:10'].map((time) => ({
      token: o.tokens[0],
      dueAt: o.due(time),
      reminder: 0,
      scheduleIds: o.ids(time),
    })),
    'a batch of one due instant claims all three doses due at it',
  )
})

test('A due instant with one Occurrence left after Taken or Skipped submits the single-dose reminder', async () => {
  const o = await owner('2026-11-25', ['09:00'], 1, 3)
  const failing = fake(() => ({ outcome: 'transient', code: 'UNAVAILABLE' }))
  await run(failing.provider, '2026-11-25T06:00:00.000Z')
  assert.equal(failing.sent[0].scheduleIds.length, 3)

  const [skipped, taken, left] = o.scheduleIds
  o.setNow('2026-11-25T06:05:00.000Z')
  await o.operations.recordSkipped({ scheduleId: skipped, dueAt: o.due('09:00') })
  await o.operations.recordTaken({
    scheduleId: taken,
    dueAt: o.due('09:00'),
    takenAt: '2026-11-25T06:05:00.000Z',
    quantity: 1,
  })

  const { provider, sent } = fake()
  assert.deepEqual(await run(provider, '2026-11-25T06:06:00.000Z'), {
    submitted: 1,
    dropped: 2,
    retrying: 0,
  })
  assert.deepEqual(sent, [
    { token: o.tokens[0], dueAt: o.due('09:00'), reminder: 0, scheduleIds: [left] },
  ])
})

// #34: a Medicine's next Occurrence drops its older Occurrences' unsent reminders, at equality too.
test("Once a Medicine's next Occurrence is due, its older Occurrence's reminders drop unsent, record no Dose outcome and leave other Medicines' reminders", async () => {
  const date = '2026-12-06'
  const o = await owner(date, ['08:00'])
  const other = o.scheduleId
  const tablet = await schedule(o, date, await anotherMedicine(o.ownerId), ['08:00', '08:40'])
  const { provider, sent } = fake()
  await run(provider, `${date}T05:00:00.000Z`)
  assert.deepEqual(sent, [
    { token: o.tokens[0], dueAt: o.due('08:00'), reminder: 0, scheduleIds: [other, tablet].sort() },
  ])

  sent.length = 0
  assert.deepEqual(await run(provider, `${date}T05:40:00.000Z`), {
    submitted: 2,
    dropped: 0,
    retrying: 0,
  })
  assert.deepEqual(
    sent.map((m) => [m.dueAt, m.reminder, m.scheduleIds]).toSorted(),
    [
      [o.due('08:00'), 1, [other]],
      [o.due('08:40'), 0, [tablet]],
    ],
    "only the 08:40 Original reminder and the other Medicine's Follow-up reminder submit",
  )

  sent.length = 0
  await run(provider, `${date}T06:20:00.000Z`)
  assert.deepEqual(sent.map((m) => [m.dueAt, m.reminder, m.scheduleIds]).toSorted(), [
    [o.due('08:00'), 2, [other]],
    [o.due('08:40'), 1, [tablet]],
  ])
  assert.deepEqual(
    await attemptedSchedules(o.ownerId, o.due('08:00'), 1),
    [other],
    'no Delivery attempt for the older Occurrence',
  )
  const outcomes = await db
    .prepare(
      `SELECT (SELECT COUNT(*) FROM dose_records WHERE owner_id=?1 AND schedule_id=?2)
        + (SELECT COUNT(*) FROM skipped_dose_records WHERE owner_id=?1 AND schedule_id=?2) AS n`,
    )
    .bind(o.ownerId, tablet)
    .first<{ n: number }>()
  assert.equal(outcomes?.n, 0, 'the 08:00 Occurrence stays Not logged')
})

test('A transient answer, an abandoned claim or a claim processed after the next Occurrence is due never submits the older reminder', async () => {
  // Transient answer at 08:00; the 08:03 run submits only the 08:03 Original reminder.
  const transient = await owner('2026-12-07', [])
  await schedule(transient, '2026-12-07', transient.medicineId, ['08:00', '08:03'])
  const failing = fake(() => ({ outcome: 'transient', code: 'UNAVAILABLE' }))
  await run(failing.provider, '2026-12-07T05:00:00.000Z')
  assert.equal(failing.sent.length, 1)
  const later = fake()
  assert.deepEqual(await run(later.provider, '2026-12-07T05:03:00.000Z'), {
    submitted: 1,
    dropped: 1,
    retrying: 0,
  })
  assert.deepEqual(summary(later.sent), [`${transient.due('08:03')} #0 x1`])
  assert.deepEqual(await reminderState(transient.ownerId), [
    { dueAt: transient.due('08:00'), state: 'dropped' },
    { dueAt: transient.due('08:03'), state: 'submitted' },
  ])

  // A claim abandoned at 08:00 whose lease expires at 08:05, after 08:03 is due.
  const abandoned = await owner('2026-12-08', [])
  await schedule(abandoned, '2026-12-08', abandoned.medicineId, ['08:00', '08:03'])
  let resume!: () => void
  const stalled = new Promise<void>((resolve) => (resume = resolve))
  let reached!: () => void
  const claimed = new Promise<void>((resolve) => (reached = resolve))
  const stalling = fake(async () => {
    reached()
    await stalled
    return { outcome: 'accepted' }
  })
  const stalledRun = run(stalling.provider, '2026-12-08T05:00:00.000Z')
  await claimed
  const { provider, sent } = fake()
  await run(provider, '2026-12-08T05:03:00.000Z')
  assert.deepEqual(await run(provider, '2026-12-08T05:05:00.000Z'), {
    submitted: 0,
    dropped: 1,
    retrying: 0,
  })
  resume()
  assert.deepEqual(await stalledRun, { submitted: 0, dropped: 0, retrying: 0 })
  assert.deepEqual(summary(sent), [`${abandoned.due('08:03')} #0 x1`])

  // A run claims at 08:02:59 and processes the claim at 08:03:00.
  const crossing = await owner('2026-12-09', [])
  await schedule(crossing, '2026-12-09', crossing.medicineId, ['08:00', '08:03'])
  await run(failing.provider, '2026-12-09T05:00:00.000Z')
  const times = ['2026-12-09T05:02:59.000Z']
  const slow = fake()
  assert.deepEqual(
    await runDueReminders(
      drizzle(db),
      slow.provider,
      () => new Date(times.shift() ?? '2026-12-09T05:03:00.000Z'),
    ),
    { submitted: 0, dropped: 1, retrying: 0 },
  )
  assert.deepEqual(slow.sent, [])
})

test("An Occurrence of a successor Schedule version suppresses the earlier version's reminders", async () => {
  const date = '2026-12-10'
  const o = await owner(date, [])
  const first = await schedule(o, date, o.medicineId, ['08:00', '12:00'])
  await run(
    fake(() => ({ outcome: 'transient', code: 'UNAVAILABLE' })).provider,
    `${date}T05:00:00.000Z`,
  )
  o.setNow(`${date}T05:10:00.000Z`)
  const successor = randomUUID()
  await o.operations.edit({
    id: successor,
    basedOnId: first,
    endDate: date,
    times: [
      { time: '08:30', quantity: 1 },
      { time: '12:00', quantity: 1 },
    ],
  })
  const { provider, sent } = fake()
  assert.deepEqual(await run(provider, `${date}T05:30:00.000Z`), {
    submitted: 1,
    dropped: 1,
    retrying: 0,
  })
  await run(provider, `${date}T05:40:00.000Z`)
  assert.deepEqual(sent, [
    { token: o.tokens[0], dueAt: o.due('08:30'), reminder: 0, scheduleIds: [successor] },
  ])
})

const schedulerSecret = 'synthetic-scheduler-secret-at-least-32-characters'
const bindings = () => ({
  DB: db,
  MEDICINES_WORKER_SECRET: secret,
  SCHEDULER_SECRET: schedulerSecret,
})

test('The cron trigger runs the due-reminder operation, and stops before claiming without FCM secrets', async () => {
  const o = await owner('2026-11-20', ['09:00'])
  const { provider, sent } = fake()
  const cron = (at: string) =>
    createWorker(
      () => new Date(at),
      () => provider,
    ).scheduled(undefined, bindings())

  await cron('2026-11-20T05:59:00.000Z')
  assert.equal(sent.length, 0)
  await cron('2026-11-20T06:00:00.000Z')
  assert.deepEqual(sent, [
    { token: o.tokens[0], dueAt: o.due('09:00'), reminder: 0, scheduleIds: [o.scheduleId] },
  ])
  assert.deepEqual(await reminderState(o.ownerId), [{ dueAt: o.due('09:00'), state: 'submitted' }])

  const unconfigured = await owner('2026-11-21', ['09:00'])
  await assert.rejects(
    createWorker(() => new Date('2026-11-21T06:00:00.000Z')).scheduled(undefined, bindings()),
    { message: 'due_reminder_failure' },
  )
  assert.deepEqual(await reminderState(unconfigured.ownerId), [], 'no reminder is spent')
})

test('The scheduler command runs the same operation with its own secret and answers counts only', async () => {
  const o = await owner('2026-11-22', ['09:00'])
  const { provider, sent } = fake()
  const worker = createWorker(
    () => new Date('2026-11-22T06:00:00.000Z'),
    () => provider,
  )
  const command = (authorization?: string, env = bindings(), path = '/due-reminders') =>
    worker.fetch(
      new Request(`http://worker${path}`, {
        method: 'POST',
        headers: authorization ? { authorization } : {},
        body: JSON.stringify({ ownerId: o.ownerId, operation: 'list' }),
      }),
      env,
    )

  for (const authorization of [undefined, `Bearer ${secret}`, `Bearer ${schedulerSecret}x`]) {
    const refused = await command(authorization)
    assert.equal(refused.status, 401)
    assert.deepEqual(await refused.json(), { error: 'unauthorized' })
  }
  const unset = await command(`Bearer ${schedulerSecret}`, { ...bindings(), SCHEDULER_SECRET: '' })
  assert.equal(unset.status, 503)
  const ownerCommand = await command(`Bearer ${schedulerSecret}`, bindings(), '/medicines')
  assert.equal(ownerCommand.status, 401, 'the scheduler secret runs no owner command')
  assert.equal(sent.length, 0)
  assert.deepEqual(await reminderState(o.ownerId), [])

  const response = await command(`Bearer ${schedulerSecret}`)
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('cache-control'), 'no-store')
  assert.deepEqual(await response.json(), { submitted: 1, dropped: 0, retrying: 0 })
  assert.deepEqual(
    sent.map((m) => m.token),
    o.tokens,
  )
})
