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
import { setQuietHours } from '../worker/quiet-hours'
import { setMedicationNames } from '../worker/medication-names'
import { snoozeDose } from '../worker/snoozes'
import { fcmMessage } from '../worker/fcm'
import { reminderLink } from '../src/features/schedules/reminder-link'
import {
  call,
  medicine,
  runtime,
  secret,
  startWorkerRuntime,
  versionFixture,
} from './helpers/medicine-storage-runtime'

// The due-reminder operation on real D1 with controlled time and a fake provider (#366, #31, #35,
// #36, #37).
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
  sent
    .map(
      (m) =>
        `${m.dueAt} #${m.reminder} x${m.scheduleIds.length}${m.snoozedTo ? ` snoozed ${m.snoozedTo}` : ''}`,
    )
    .toSorted()

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

const quiet = (ownerId: string, quietHours: boolean) =>
  setQuietHours(
    drizzle(db),
    ownerId,
    { actionId: randomUUID(), quietHours },
    new Date('2026-11-17T10:00:00.000Z'),
  )
/** Runs at each Istanbul time on `date`, answering each run's counts. */
const runAt = async (provider: ReminderProvider, date: string, times: string[]) => {
  const runs = []
  for (const time of times) runs.push(await run(provider, `${date}T${time}:00+03:00`))
  return runs
}
const counts = (submitted: number, dropped: number) => ({ submitted, dropped, retrying: 0 })

test('With Quiet hours on, Follow-up reminders targeted inside 23:00 to 08:00 drop unsent while Original reminders submit', async () => {
  const o = await owner('2026-12-01', ['07:19', '07:20', '22:20', '23:30'])
  await quiet(o.ownerId, true)
  const { provider, sent } = fake()
  const runs = await runAt(provider, '2026-12-01', [
    '07:19',
    '07:20',
    '07:59',
    '08:00',
    '22:20',
    '23:00',
    '23:01',
    '23:30',
    '23:40',
  ])
  assert.deepEqual(runs, [
    counts(1, 0),
    counts(1, 0),
    counts(0, 1),
    counts(1, 0),
    counts(1, 0),
    counts(0, 1),
    counts(0, 0),
    counts(1, 0),
    counts(0, 1),
  ])
  assert.deepEqual(
    summary(sent),
    [
      `${o.due('07:19')} #0 x1`,
      `${o.due('07:20')} #0 x1`,
      `${o.due('07:20')} #1 x1`,
      `${o.due('22:20')} #0 x1`,
      `${o.due('23:30')} #0 x1`,
    ],
    'the 07:59 and 23:00 Follow-up reminders drop, the 08:00 one and the 23:30 Original submit',
  )
  assert.deepEqual(await followUpState(o.ownerId), [
    { reminder: 1, state: 'dropped' },
    { reminder: 1, state: 'submitted' },
    { reminder: 1, state: 'dropped' },
    { reminder: 2, state: 'dropped' },
  ])
  assert.deepEqual(await attemptedSchedules(o.ownerId, o.due('07:19'), 1), [])
  assert.deepEqual(await attemptedSchedules(o.ownerId, o.due('22:20'), 1), [])
})

test('With Quiet hours on, a Follow-up reminder targeted at 22:59 and processed at 23:01 drops unsent', async () => {
  const o = await owner('2026-12-03', ['22:19'])
  await quiet(o.ownerId, true)
  const { provider, sent } = fake()
  assert.deepEqual(await runAt(provider, '2026-12-03', ['23:01']), [counts(0, 1)])
  assert.deepEqual(sent, [])
  assert.deepEqual(await followUpState(o.ownerId), [{ reminder: 1, state: 'dropped' }])
})

test('With Quiet hours off, Follow-up reminders targeted at 23:00 and 07:59 submit', async () => {
  const o = await owner('2026-12-02', ['07:19', '22:20'])
  await quiet(o.ownerId, true)
  await quiet(o.ownerId, false)
  const { provider, sent } = fake()
  assert.deepEqual(await runAt(provider, '2026-12-02', ['07:59', '23:00']), [
    counts(1, 0),
    counts(1, 0),
  ])
  assert.deepEqual(summary(sent), [`${o.due('07:19')} #1 x1`, `${o.due('22:20')} #1 x1`])
})

test('Turning Quiet hours on after a Follow-up reminder is recorded and before it is claimed drops it at send time', async () => {
  const o = await owner('2026-12-11', ['22:20'])
  const { provider, sent } = fake()
  assert.deepEqual(
    await run(provider, '2026-12-11T23:00:00+03:00', 0),
    counts(0, 0),
    'a run with no batch records the reminder without claiming it',
  )
  assert.deepEqual(await followUpState(o.ownerId), [{ reminder: 1, state: 'pending' }])

  await quiet(o.ownerId, true)
  assert.deepEqual(await runAt(provider, '2026-12-11', ['23:01']), [counts(0, 1)])
  assert.deepEqual(sent, [])
  assert.deepEqual(await followUpState(o.ownerId), [{ reminder: 1, state: 'dropped' }])
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
    { message: 'unavailable' },
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

const names = (ownerId: string, medicationNames: boolean) =>
  setMedicationNames(
    drizzle(db),
    ownerId,
    { actionId: randomUUID(), medicationNames },
    new Date('2026-11-17T10:00:00.000Z'),
  )
/** Renames the Medicine of `scheduleId` through the Worker's detail correction. */
async function relabel(ownerId: string, scheduleId: string, label: string) {
  const row = await db
    .prepare(
      `SELECT m.id, m.revision FROM daily_schedules s JOIN user_medications m
        ON m.owner_id = s.owner_id AND m.id = s.medicine_id WHERE s.owner_id=? AND s.id=?`,
    )
    .bind(ownerId, scheduleId)
    .first<{ id: string; revision: number }>()
  const corrected = await call({
    operation: 'correctDetails',
    ownerId,
    correction: {
      actionId: randomUUID(),
      medicineId: row!.id,
      expectedRevision: row!.revision,
      strengthRevisionId: row!.id,
      label,
      strength: '1000 IU',
      unit: 'tablet',
    },
  })
  assert.equal(corrected.status, 200)
}

test('With Medication names off, single and grouped Original and Follow-up reminders hand the provider no Medicine label', async () => {
  const single = await owner('2026-12-12', ['09:00'])
  const grouped = await owner('2026-12-12', ['09:00'], 1, 2)
  await relabel(single.ownerId, single.scheduleId, 'Aspirin')
  for (const [index, scheduleId] of grouped.scheduleIds.entries())
    await relabel(grouped.ownerId, scheduleId, ['Metformin', 'Vitamin D'][index])
  await names(grouped.ownerId, true)
  await names(grouped.ownerId, false)
  const { provider, sent } = fake()
  await runAt(provider, '2026-12-12', ['09:00', '09:40'])

  assert.deepEqual(summary(sent), [
    `${single.due('09:00')} #0 x1`,
    `${single.due('09:00')} #0 x2`,
    `${single.due('09:00')} #1 x1`,
    `${single.due('09:00')} #1 x2`,
  ])
  for (const message of sent) {
    assert.ok(!('labels' in message), 'no labels field')
    assert.doesNotMatch(JSON.stringify(message), /Aspirin|Metformin|Vitamin/)
  }
})

test('Turning Medication names on, or renaming the Medicine, after a reminder is recorded and before it is claimed sends the current labels, never stored in Delivery attempts', async () => {
  const o = await owner('2026-12-13', ['09:00'], 1, 2)
  const [first, second] = o.scheduleIds
  await relabel(o.ownerId, first, 'Metformin')
  await relabel(o.ownerId, second, 'Aspirin')
  const { provider, sent } = fake()
  assert.deepEqual(
    await run(provider, '2026-12-13T09:00:00+03:00', 0),
    counts(0, 0),
    'a run with no batch records the Original reminder without claiming it',
  )
  await names(o.ownerId, true)
  await run(provider, '2026-12-13T09:01:00+03:00')

  assert.deepEqual(await run(provider, '2026-12-13T09:40:00+03:00', 0), counts(0, 0))
  await relabel(o.ownerId, second, 'Vitamin D')
  await run(provider, '2026-12-13T09:41:00+03:00')

  assert.deepEqual(
    sent.map((m) => ({ reminder: m.reminder, labels: m.labels })),
    [
      { reminder: 0, labels: ['Aspirin', 'Metformin'] },
      { reminder: 1, labels: ['Metformin', 'Vitamin D'] },
    ],
    'each Medicine once, in label order, as labelled when sent',
  )
  const attempts = (
    await db
      .prepare('SELECT * FROM delivery_attempts WHERE owner_id=?')
      .bind(o.ownerId)
      .all<Record<string, unknown>>()
  ).results
  assert.equal(attempts.length, 4)
  assert.doesNotMatch(JSON.stringify(attempts), /Aspirin|Metformin|Vitamin/)
})

// Snoozes (#36). Times are Istanbul; `ist` turns `<date>`, `<HH:MM[:SS]>` into an instant.
const ist = (date: string, time: string) =>
  new Date(`${date}T${time.length === 5 ? `${time}:00` : time}+03:00`).toISOString()
const snooze = (o: Awaited<ReturnType<typeof owner>>, at: string, scheduleId = o.scheduleId) =>
  snoozeDose(
    drizzle(db),
    o.ownerId,
    { actionId: randomUUID(), scheduleId, dueAt: o.due('09:00') },
    new Date(at),
  )
const snoozeState = async (ownerId: string) =>
  (
    await db
      .prepare(
        'SELECT reminder, target_at AS targetAt, state FROM snoozes WHERE owner_id=? ORDER BY reminder',
      )
      .bind(ownerId)
      .all<{ reminder: number; targetAt: string; state: string }>()
  ).results
const runIst = async (provider: ReminderProvider, date: string, times: string[]) => {
  for (const time of times) await run(provider, ist(date, time))
}

test('Snooze timing follows #9 D2: immediate, intermediate and final-slot extension', async () => {
  const immediate = await owner('2027-01-04', ['09:00'])
  const intermediate = await owner('2027-01-05', ['09:00'])
  const extension = await owner('2027-01-06', ['09:00'])
  const { provider, sent } = fake()

  // Immediate snooze: accepted at 09:00 sends at 09:40 and keeps 10:20.
  const day = '2027-01-04'
  await runIst(provider, day, ['09:00'])
  assert.deepEqual(await snooze(immediate, ist(day, '09:00')), {
    outcome: 'snoozed',
    targetAt: ist(day, '09:40'),
  })
  await runIst(provider, day, ['09:40', '09:41', '10:20', '10:21'])
  const due = immediate.due('09:00')
  assert.deepEqual(summary(sent), [
    `${due} #0 x1`,
    `${due} #1 x1 snoozed ${ist(day, '09:40')}`,
    `${due} #2 x1`,
  ])

  // Intermediate snooze: accepted at 09:20 sends at 10:00 and retires 10:20.
  sent.length = 0
  const day2 = '2027-01-05'
  await runIst(provider, day2, ['09:00'])
  assert.deepEqual(await snooze(intermediate, ist(day2, '09:20')), {
    outcome: 'snoozed',
    targetAt: ist(day2, '10:00'),
  })
  await runIst(provider, day2, ['09:40', '10:00', '10:01', '10:20', '10:21'])
  const due2 = intermediate.due('09:00')
  assert.deepEqual(summary(sent), [`${due2} #0 x1`, `${due2} #1 x1 snoozed ${ist(day2, '10:00')}`])
  assert.deepEqual(await followUpState(intermediate.ownerId), [
    { reminder: 1, state: 'dropped' },
    { reminder: 2, state: 'dropped' },
  ])

  // Final-slot extension: after the 09:40 submission, one at 10:10 replaces 10:20 with 10:50.
  sent.length = 0
  const day3 = '2027-01-06'
  await runIst(provider, day3, ['09:00', '09:40'])
  assert.deepEqual(await snooze(extension, ist(day3, '10:10')), {
    outcome: 'snoozed',
    targetAt: ist(day3, '10:50'),
  })
  await runIst(provider, day3, ['10:20', '10:21', '10:50', '10:51'])
  const due3 = extension.due('09:00')
  assert.deepEqual(summary(sent), [
    `${due3} #0 x1`,
    `${due3} #1 x1`,
    `${due3} #2 x1 snoozed ${ist(day3, '10:50')}`,
  ])
  assert.deepEqual(await snoozeState(extension.ownerId), [
    { reminder: 2, targetAt: ist(day3, '10:50'), state: 'submitted' },
  ])
})

test('A snooze at 10:20 before the 10:20 reminder submits targets 11:00; after that submission it is exhausted', async () => {
  const first = await owner('2027-01-07', ['09:00'])
  const late = await owner('2027-01-08', ['09:00'])
  const { provider, sent } = fake()

  const day = '2027-01-07'
  await runIst(provider, day, ['09:40'])
  assert.deepEqual(await snooze(first, ist(day, '10:20')), {
    outcome: 'snoozed',
    targetAt: ist(day, '11:00'),
  })
  await runIst(provider, day, ['10:20', '10:21', '11:00'])
  const due = first.due('09:00')
  assert.deepEqual(summary(sent), [`${due} #1 x1`, `${due} #2 x1 snoozed ${ist(day, '11:00')}`])

  sent.length = 0
  const day2 = '2027-01-08'
  await runIst(provider, day2, ['09:40', '10:20'])
  assert.deepEqual(await snooze(late, ist(day2, '10:20')), {
    outcome: 'rejected',
    reason: 'exhausted',
  })
  assert.deepEqual(await snoozeState(late.ownerId), [])
  assert.equal(sent.length, 2)
})

test('A pending snooze blocks automatic reminders until its target and submits through 5 minutes later', async () => {
  const recovery = await owner('2027-01-09', ['09:00'])
  const dropped = await owner('2027-01-10', ['09:00'])
  const onTime = await owner('2027-01-11', ['09:00'])
  const { provider, sent } = fake()

  // Pending snooze recovery: a 10:00 snooze checked at 09:50 and 10:04 sends once at 10:04.
  const day = '2027-01-09'
  await snooze(recovery, ist(day, '09:20'))
  await runIst(provider, day, ['09:50'])
  assert.equal(sent.length, 0, 'no automatic 09:40 send')
  await runIst(provider, day, ['10:04', '10:05', '10:20'])
  assert.deepEqual(summary(sent), [`${recovery.due('09:00')} #1 x1 snoozed ${ist(day, '10:00')}`])

  // Snooze lateness: a 10:50 snooze first processed at 10:55:01 drops with no replacement.
  sent.length = 0
  const day2 = '2027-01-10'
  await runIst(provider, day2, ['09:40'])
  await snooze(dropped, ist(day2, '10:10'))
  await runIst(provider, day2, ['10:55:01', '10:56', '11:00'])
  assert.deepEqual(summary(sent), [`${dropped.due('09:00')} #1 x1`])
  assert.deepEqual(await snoozeState(dropped.ownerId), [
    { reminder: 2, targetAt: ist(day2, '10:50'), state: 'dropped' },
  ])

  // Processed at exactly 10:55, it submits.
  sent.length = 0
  const day3 = '2027-01-11'
  await runIst(provider, day3, ['09:40'])
  await snooze(onTime, ist(day3, '10:10'))
  await runIst(provider, day3, ['10:55'])
  assert.deepEqual(summary(sent), [
    `${onTime.due('09:00')} #1 x1`,
    `${onTime.due('09:00')} #2 x1 snoozed ${ist(day3, '10:50')}`,
  ])
})

test('With Quiet hours on, a snooze targeted inside them is accepted dropped and retires the second Follow-up reminder, and a 22:59 target processed at 23:01 drops', async () => {
  const target = await owner('2027-01-12', ['22:00'])
  const crossing = await owner('2027-01-13', ['22:00'])
  await quiet(target.ownerId, true)
  await quiet(crossing.ownerId, true)
  const { provider, sent } = fake()
  const at22 = (o: typeof target, at: string) =>
    snoozeDose(
      drizzle(db),
      o.ownerId,
      { actionId: randomUUID(), scheduleId: o.scheduleId, dueAt: o.due('22:00') },
      new Date(at),
    )

  // Quiet target: a snooze accepted at 22:30 targets 23:10.
  const day = '2027-01-12'
  await runIst(provider, day, ['22:00'])
  assert.deepEqual(await at22(target, ist(day, '22:30')), {
    outcome: 'dropped',
    targetAt: ist(day, '23:10'),
  })
  await runIst(provider, day, ['22:40', '23:10', '23:20', '23:21'])
  assert.deepEqual(summary(sent), [`${target.due('22:00')} #0 x1`])
  assert.deepEqual(await snoozeState(target.ownerId), [
    { reminder: 1, targetAt: ist(day, '23:10'), state: 'dropped' },
  ])
  assert.deepEqual(await followUpState(target.ownerId), [
    { reminder: 1, state: 'dropped' },
    { reminder: 2, state: 'dropped' },
  ])

  // Quiet crossing: a 22:59 target processed at 23:01 drops.
  sent.length = 0
  const day2 = '2027-01-13'
  assert.deepEqual(await at22(crossing, ist(day2, '22:19')), {
    outcome: 'snoozed',
    targetAt: ist(day2, '22:59'),
  })
  await runIst(provider, day2, ['23:01', '23:02'])
  assert.equal(sent.length, 0)
  assert.deepEqual(await snoozeState(crossing.ownerId), [
    { reminder: 1, targetAt: ist(day2, '22:59'), state: 'dropped' },
  ])
})

test('Taken, Skipped, a pause or the next same-Medicine dose due at 10:50 drops a pending 10:50 snooze unsent', async () => {
  const taken = await owner('2027-01-14', ['09:00'])
  const skipped = await owner('2027-01-15', ['09:00'])
  const paused = await owner('2027-01-16', ['09:00'])
  const next = await owner('2027-01-17', [])
  const nextId = await schedule(next, '2027-01-17', next.medicineId, ['09:00', '10:50'])
  const { provider, sent } = fake()
  const pending = async (o: typeof taken, day: string, scheduleId = o.scheduleId) => {
    await runIst(provider, day, ['09:40'])
    assert.deepEqual(await snooze(o, ist(day, '10:10'), scheduleId), {
      outcome: 'snoozed',
      targetAt: ist(day, '10:50'),
    })
    o.setNow(ist(day, '10:49'))
  }

  await pending(taken, '2027-01-14')
  await taken.operations.recordTaken({
    scheduleId: taken.scheduleId,
    dueAt: taken.due('09:00'),
    takenAt: ist('2027-01-14', '10:49'),
    quantity: 1,
  })
  await pending(skipped, '2027-01-15')
  await skipped.operations.recordSkipped({
    scheduleId: skipped.scheduleId,
    dueAt: skipped.due('09:00'),
  })
  await pending(paused, '2027-01-16')
  await paused.operations.pause({ id: randomUUID(), basedOnId: paused.scheduleId })
  await pending(next, '2027-01-17', nextId)
  sent.length = 0

  for (const day of ['2027-01-14', '2027-01-15', '2027-01-16', '2027-01-17'])
    await runIst(provider, day, ['10:50', '10:51'])
  assert.deepEqual(
    summary(sent),
    [`${next.due('10:50')} #0 x1`],
    "only the next dose's own Original reminder",
  )
  assert.deepEqual(sent[0].scheduleIds, [nextId])
  for (const o of [taken, skipped, paused, next])
    assert.deepEqual(
      (await snoozeState(o.ownerId)).map((row) => row.state),
      ['dropped'],
    )
})

test('A snooze reminder goes to each Device registration covering only its Occurrence, even when another dose shared its due instant', async () => {
  const o = await owner('2027-01-18', ['09:00'], 2, 2)
  const [snoozed, other] = o.ids('09:00')
  const { provider, sent } = fake()
  const day = '2027-01-18'
  await runIst(provider, day, ['09:00'])
  await snooze(o, ist(day, '09:00'), snoozed)
  sent.length = 0
  await runIst(provider, day, ['09:40'])

  const dueAt = o.due('09:00')
  const byToken = (a: ReminderMessage, b: ReminderMessage) =>
    a.token.localeCompare(b.token) || Number(!!a.snoozedTo) - Number(!!b.snoozedTo)
  assert.deepEqual(
    sent.toSorted(byToken),
    o.tokens.toSorted().flatMap((token) => [
      { token, dueAt, reminder: 1, scheduleIds: [other] },
      { token, dueAt, reminder: 1, scheduleIds: [snoozed], snoozedTo: ist(day, '09:40') },
    ]),
  )
  const message = sent.find((m) => m.snoozedTo)!
  const body = fcmMessage(message, new Date(ist(day, '09:40'))).message
  assert.equal(body.data.link, reminderLink({ scheduleId: snoozed, dueAt }))
  assert.equal(body.notification.title, 'Your 09:00 dose')
  assert.deepEqual(
    (await attemptedSchedules(o.ownerId, dueAt, 1)).toSorted(),
    [other, other, snoozed, snoozed].toSorted(),
  )
})
