import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { drizzle } from 'drizzle-orm/d1'
import { beforeAll, test, vi } from 'vitest'
import { createWorker } from '../worker/index'
import { saveDeviceRegistration } from '../worker/device-registrations'
import { runDueReminders, type ReminderProvider } from '../worker/due-reminders'
import { setQuietHours } from '../worker/quiet-hours'
import { POST } from '../src/app/api/snoozes/route'
import {
  runtime,
  secret,
  startWorkerRuntime,
  versionFixture,
} from './helpers/medicine-storage-runtime'
import { installSyntheticWorker } from './helpers/synthetic-worker'

// The Snooze command on real D1, through the API route, server wiring and Worker (#36). Times are
// Istanbul; each case uses its own date so no run reaches another case's Occurrences.
const session = vi.hoisted(() => ({ id: null as string | null }))
vi.mock('server-only', () => ({}))
vi.mock('@/features/auth/server', () => ({
  requireUser: async () => {
    if (!session.id) throw new Error('synthetic unauthenticated session')
    return { id: session.id }
  },
}))
startWorkerRuntime()
installSyntheticWorker()

let db: D1Database
let now = new Date()
beforeAll(async () => {
  db = await runtime.getD1Database('DB')
  process.env.MEDICINES_WORKER_SECRET = secret
  const worker = createWorker(() => now)
  globalThis.fetch = async (url, init) =>
    worker.fetch(
      new Request(url as URL, { method: init!.method, headers: init!.headers, body: init!.body }),
      { DB: db, MEDICINES_WORKER_SECRET: secret },
    )
})

const ist = (date: string, time: string) =>
  new Date(`${date}T${time.length === 5 ? `${time}:00` : time}+03:00`).toISOString()
const provider: ReminderProvider = { submit: async () => ({ outcome: 'accepted' }) }
const run = (at: string) => runDueReminders(drizzle(db), provider, () => new Date(at))

/** One account with one Schedule taking a dose at `time` on `date` only. */
async function dose(date: string, time = '09:00', { device = true } = {}) {
  const f = await versionFixture()
  f.setNow(`${date}T04:00:00.000Z`)
  const scheduleId = randomUUID()
  await f.operations.save({
    id: scheduleId,
    medicineId: f.medicineId,
    startDate: date,
    endDate: date,
    times: [{ time, quantity: 1 }],
  })
  if (device)
    await saveDeviceRegistration(
      drizzle(db),
      f.ownerId,
      { installationId: randomUUID(), token: `token-${randomUUID()}` },
      new Date(`${date}T04:00:00.000Z`),
    )
  return { ...f, scheduleId, dueAt: ist(date, time) }
}

const origin = 'http://app.test'
/** Requests a Snooze of `d` at `at` as `as` (default its owner). */
async function snooze(
  d: Awaited<ReturnType<typeof dose>>,
  at: string,
  { actionId = randomUUID(), as = d.ownerId } = {},
) {
  now = new Date(at)
  session.id = as
  const response = await POST(
    new Request(`${origin}/api/snoozes`, {
      method: 'POST',
      headers: { origin, 'content-type': 'application/json' },
      body: JSON.stringify({ actionId, scheduleId: d.scheduleId, dueAt: d.dueAt }),
    }),
  )
  return { status: response.status, body: await response.json() }
}
const rejected = (reason: string) => ({ status: 200, body: { outcome: 'rejected', reason } })
const snoozed = (targetAt: string) => ({ status: 200, body: { outcome: 'snoozed', targetAt } })
const stored = async (ownerId: string) =>
  (
    await db
      .prepare('SELECT reminder, target_at AS targetAt, state FROM snoozes WHERE owner_id=?')
      .bind(ownerId)
      .all<{ reminder: number; targetAt: string; state: string }>()
  ).results

test('A snooze that is late, without a Follow-up reminder left, quiet, logged, paused, without a Device registration or of another account is rejected with its reason and writes nothing', async () => {
  // After ordinary expiry: 10:20:01 for a 09:00 dose.
  const expired = await dose('2027-02-01')
  assert.deepEqual(await snooze(expired, ist('2027-02-01', '10:20:01')), rejected('expired'))

  // Exhausted budget: a 09:20 Snooze submitted at 10:00 retired 10:20.
  const exhausted = await dose('2027-02-02')
  assert.deepEqual(
    await snooze(exhausted, ist('2027-02-02', '09:20')),
    snoozed(ist('2027-02-02', '10:00')),
  )
  await run(ist('2027-02-02', '10:00'))
  assert.deepEqual(await snooze(exhausted, ist('2027-02-02', '10:05')), rejected('exhausted'))
  assert.deepEqual(await stored(exhausted.ownerId), [
    { reminder: 1, targetAt: ist('2027-02-02', '10:00'), state: 'submitted' },
  ])

  // Quiet slot unavailable: 22:00 dose, 22:40 submitted, the remaining one targets 23:20.
  const quiet = await dose('2027-02-03', '22:00')
  await setQuietHours(
    drizzle(db),
    quiet.ownerId,
    { actionId: randomUUID(), quietHours: true },
    new Date('2027-02-03T04:00:00.000Z'),
  )
  await run(ist('2027-02-03', '22:40'))
  assert.deepEqual(await snooze(quiet, ist('2027-02-03', '22:50')), rejected('quietHours'))

  const taken = await dose('2027-02-04')
  taken.setNow(ist('2027-02-04', '09:10'))
  await taken.operations.recordTaken({
    scheduleId: taken.scheduleId,
    dueAt: taken.dueAt,
    takenAt: ist('2027-02-04', '09:10'),
    quantity: 1,
  })
  assert.deepEqual(await snooze(taken, ist('2027-02-04', '09:20')), rejected('logged'))

  const skipped = await dose('2027-02-05')
  skipped.setNow(ist('2027-02-05', '09:10'))
  await skipped.operations.recordSkipped({ scheduleId: skipped.scheduleId, dueAt: skipped.dueAt })
  assert.deepEqual(await snooze(skipped, ist('2027-02-05', '09:20')), rejected('logged'))

  const paused = await dose('2027-02-06')
  paused.setNow(ist('2027-02-06', '09:10'))
  await paused.operations.pause({ id: randomUUID(), basedOnId: paused.scheduleId })
  assert.deepEqual(await snooze(paused, ist('2027-02-06', '09:20')), rejected('paused'))

  const unregistered = await dose('2027-02-07', '09:00', { device: false })
  assert.deepEqual(
    await snooze(unregistered, ist('2027-02-07', '09:20')),
    rejected('notificationsOff'),
  )

  const theirs = await dose('2027-02-08')
  const mine = await dose('2027-02-08', '08:00')
  assert.deepEqual(
    await snooze(theirs, ist('2027-02-08', '09:20'), { as: mine.ownerId }),
    rejected('notFound'),
  )

  const early = await dose('2027-02-09')
  assert.deepEqual(await snooze(early, ist('2027-02-09', '08:59:59')), rejected('notDue'))

  for (const d of [expired, quiet, taken, skipped, paused, unregistered, theirs, mine, early])
    assert.deepEqual(await stored(d.ownerId), [], 'a rejection writes nothing')

  assert.equal(
    (await snooze(expired, ist('2027-02-01', '09:20'), { as: '' })).status,
    401,
    'signed out',
  )
})

test('While a 10:00 snooze is pending, a distinct request is rejected, a retry returns 10:00 and concurrent requests reserve the slot once', async () => {
  const d = await dose('2027-02-10')
  const actionId = randomUUID()
  const target = ist('2027-02-10', '10:00')
  assert.deepEqual(await snooze(d, ist('2027-02-10', '09:20'), { actionId }), snoozed(target))
  assert.deepEqual(await snooze(d, ist('2027-02-10', '09:30')), rejected('pending'))
  assert.deepEqual(
    await snooze(d, ist('2027-02-10', '09:30'), { actionId }),
    snoozed(target),
    'a retry returns its original outcome',
  )
  assert.deepEqual(await stored(d.ownerId), [{ reminder: 1, targetAt: target, state: 'pending' }])

  const other = await dose('2027-02-10', '08:00')
  now = new Date(ist('2027-02-10', '09:30'))
  session.id = d.ownerId
  assert.equal(
    (
      await POST(
        new Request(`${origin}/api/snoozes`, {
          method: 'POST',
          headers: { origin, 'content-type': 'application/json' },
          body: JSON.stringify({ actionId, scheduleId: other.scheduleId, dueAt: other.dueAt }),
        }),
      )
    ).status,
    409,
    'a reused action ID naming another dose is a conflict',
  )

  // Two concurrent distinct requests.
  const race = await dose('2027-02-11')
  const at = ist('2027-02-11', '09:20')
  now = new Date(at)
  const answers = await Promise.all([snooze(race, at), snooze(race, at)])
  assert.deepEqual(answers.map((answer) => answer.body.outcome).toSorted(), ['rejected', 'snoozed'])
  assert.deepEqual(
    answers.find((answer) => answer.body.outcome === 'rejected'),
    rejected('pending'),
  )
  assert.deepEqual(await stored(race.ownerId), [
    { reminder: 1, targetAt: ist('2027-02-11', '10:00'), state: 'pending' },
  ])
})
