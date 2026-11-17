// The due-reminder operation (#366, docs/product/reminders.md #30). Each run:
// 1. records every Occurrence whose Original reminder is due - from its due instant through due
//    +80 minutes inclusive (#9 D4) - for owners with a Device registration, once per Occurrence;
// 2. drops recorded reminders whose window has passed, unsent;
// 3. claims a bounded batch of owners' due instants with one conditional UPDATE ... RETURNING that
//    sets a fresh claim token and lease (#5) on every claimable reminder of each instant, so
//    overlapping runs never claim the same reminder or split an instant, and an abandoned claim
//    becomes claimable again once its lease expires;
// 4. rechecks expiry and Taken/Skipped per Occurrence at processing time, then submits one
//    reminder per due instant (#372) through the provider port to each Device registration,
//    covering the remaining Occurrences without a final answer for it, and records one Delivery
//    attempt per covered Occurrence with the submission's answer.
// A reminder recorded after its instant was claimed is claimed, and sent, on its own. A transient
// answer releases the reminders it covers for the next run inside their window; accepted and
// rejected answers are final for that Device registration. Only the claim token holder settles a
// reminder. An `UNREGISTERED` or `NOT_FOUND` answer removes that Device registration unless it has
// since been renewed with another token. Delivery attempts hold no registration token and no
// medication name, and this module logs nothing. The FCM provider is worker/fcm.ts.
import { and, eq, gte, isNull, lt, lte, or, sql } from 'drizzle-orm'
import type { DrizzleD1Database } from 'drizzle-orm/d1'
import { istanbulDate } from '../src/features/schedules/contract'
import { scheduleSlotsOn } from '../src/features/schedules/occurrences'
import { dailySchedules, deliveryAttempts, deviceRegistrations, originalReminders } from './schema'

/**
 * One reminder for one Device registration, covering the Original reminders of the schedules in
 * `scheduleIds` due at `dueAt`. One schedule gets its Occurrence's Reminder link; several get the
 * grouped Reminder link.
 */
export type ReminderMessage = { token: string; dueAt: string; scheduleIds: string[] }

/** The provider's answer; `code` is its status code, such as `UNREGISTERED` or `TIMEOUT`. */
export type ProviderAnswer =
  | { outcome: 'accepted' }
  | { outcome: 'rejected'; code: string }
  | { outcome: 'transient'; code: string }

/** Submits one reminder and settles within a bounded time, answering a timeout as transient. */
export type ReminderProvider = { submit(message: ReminderMessage): Promise<ProviderAnswer> }

/**
 * Original reminders this run settled or released; a claim lost to another run counts in none.
 * `batch` bounds the due instants a run claims.
 */
export type DueReminderRun = { submitted: number; dropped: number; retrying: number }

/** An Original reminder is eligible from its due instant through due +80 minutes (#9 D4). */
export const REMINDER_WINDOW_MS = 80 * 60_000
const LEASE_MS = 5 * 60_000
const DUE_REMINDER_BATCH = 25
const UNREGISTERED_CODES = new Set(['UNREGISTERED', 'NOT_FOUND'])
// D1 binds at most 100 parameters per statement.
const ROWS_PER_INSERT = 10

type Reminder = { ownerId: string; scheduleId: string; dueAt: string }

export async function runDueReminders(
  db: DrizzleD1Database,
  provider: ReminderProvider,
  clock: () => Date,
  batch = DUE_REMINDER_BATCH,
): Promise<DueReminderRun> {
  const now = clock()
  const at = now.toISOString()
  const windowStart = new Date(now.getTime() - REMINDER_WINDOW_MS).toISOString()
  // One batch, so a concurrent claim never sees an instant half recorded.
  const [first, ...rest] = chunks(await dueOccurrences(db, now, windowStart)).map((rows) =>
    db.insert(originalReminders).values(rows).onConflictDoNothing(),
  )
  if (first) await db.batch([first, ...rest])
  await db
    .update(originalReminders)
    .set({ state: 'dropped', settledAt: at, claimToken: null, leaseUntil: null })
    .where(
      and(
        eq(originalReminders.state, 'pending'),
        lt(originalReminders.dueAt, windowStart),
        claimable(at),
      ),
    )

  const token = crypto.randomUUID()
  const leaseUntil = new Date(now.getTime() + LEASE_MS).toISOString()
  const claimed = await db.all<Reminder>(sql`UPDATE original_reminders
    SET claim_token = ${token}, lease_until = ${leaseUntil}
    WHERE state = 'pending' AND (lease_until IS NULL OR lease_until <= ${at})
      AND (owner_id, due_at) IN (SELECT owner_id, due_at FROM original_reminders
        WHERE state = 'pending' AND (lease_until IS NULL OR lease_until <= ${at})
          AND due_at >= ${windowStart} AND due_at <= ${at}
        GROUP BY owner_id, due_at ORDER BY due_at LIMIT ${batch})
    RETURNING owner_id AS ownerId, schedule_id AS scheduleId, due_at AS dueAt`)

  const instants = new Map<string, Reminder[]>()
  for (const reminder of [...claimed].sort((a, b) => a.dueAt.localeCompare(b.dueAt))) {
    const key = `${reminder.ownerId}:${reminder.dueAt}`
    instants.set(key, [...(instants.get(key) ?? []), reminder])
  }
  const run: DueReminderRun = { submitted: 0, dropped: 0, retrying: 0 }
  for (const reminders of instants.values())
    for (const result of await deliver(db, provider, clock, token, reminders))
      if (result) run[result]++
  return run
}

const claimable = (at: string) =>
  or(isNull(originalReminders.leaseUntil), lte(originalReminders.leaseUntil, at))

// Occurrences due inside the window, from Schedule versions that run in it; a version's
// occurrences end at its successor's Edit time (docs/architecture.md Occurrences).
async function dueOccurrences(db: DrizzleD1Database, now: Date, windowStart: string) {
  const at = now.toISOString()
  const today = istanbulDate(now)
  const dates = [...new Set([istanbulDate(new Date(windowStart)), today])]
  const schedules = await db
    .select({
      ownerId: dailySchedules.ownerId,
      id: dailySchedules.id,
      startDate: dailySchedules.startDate,
      anchorDate: dailySchedules.anchorDate,
      endDate: dailySchedules.endDate,
      weekdays: dailySchedules.weekdays,
      times: dailySchedules.times,
      intervalHours: dailySchedules.intervalHours,
      confirmedAt: dailySchedules.confirmedAt,
      replacedAt: sql<string | null>`(SELECT confirmed_at FROM daily_schedules successor
        WHERE successor.owner_id = daily_schedules.owner_id AND successor.based_on_id = daily_schedules.id)`,
    })
    .from(dailySchedules)
    .where(
      and(
        isNull(dailySchedules.stoppedAt),
        isNull(dailySchedules.pausedAt),
        lte(dailySchedules.startDate, today),
        or(isNull(dailySchedules.endDate), gte(dailySchedules.endDate, dates[0])),
        lt(dailySchedules.confirmedAt, at),
        sql`EXISTS (SELECT 1 FROM device_registrations
          WHERE device_registrations.owner_id = ${dailySchedules.ownerId})`,
      ),
    )
  return schedules.flatMap((schedule) =>
    dates.flatMap((date) =>
      scheduleSlotsOn(schedule, date)
        .map((slot) => slot.dueAt)
        .filter(
          (dueAt) =>
            dueAt >= windowStart &&
            dueAt <= at &&
            dueAt > schedule.confirmedAt &&
            (!schedule.replacedAt || dueAt <= schedule.replacedAt),
        )
        .map((dueAt) => ({ ownerId: schedule.ownerId, scheduleId: schedule.id, dueAt })),
    ),
  )
}

// Delivers one owner's due instant: rechecks expiry and Taken/Skipped per Occurrence, then submits
// one reminder to each Device registration covering the remaining Occurrences without a final
// answer for it, recording one Delivery attempt per covered Occurrence with that answer.
async function deliver(
  db: DrizzleD1Database,
  provider: ReminderProvider,
  clock: () => Date,
  token: string,
  reminders: Reminder[],
): Promise<(keyof DueReminderRun | null)[]> {
  const now = clock()
  const { ownerId, dueAt } = reminders[0]
  // Settles only while this run still holds the claim; null once another run has reclaimed it.
  const settle = async (scheduleId: string, result: keyof DueReminderRun) => {
    const held = await db
      .update(originalReminders)
      .set(
        result === 'retrying'
          ? { claimToken: null, leaseUntil: null }
          : { claimToken: null, leaseUntil: null, state: result, settledAt: now.toISOString() },
      )
      .where(
        and(
          eq(originalReminders.ownerId, ownerId),
          eq(originalReminders.scheduleId, scheduleId),
          eq(originalReminders.dueAt, dueAt),
          eq(originalReminders.claimToken, token),
        ),
      )
      .returning({ dueAt: originalReminders.dueAt })
    return held.length ? result : null
  }
  if (now.getTime() > Date.parse(dueAt) + REMINDER_WINDOW_MS)
    return Promise.all(reminders.map((reminder) => settle(reminder.scheduleId, 'dropped')))

  const recorded = new Set(
    (
      await db.all<{ scheduleId: string }>(sql`SELECT schedule_id AS scheduleId FROM dose_records
          WHERE owner_id = ${ownerId} AND due_at = ${dueAt}
        UNION SELECT schedule_id FROM skipped_dose_records
          WHERE owner_id = ${ownerId} AND due_at = ${dueAt}`)
    ).map((row) => row.scheduleId),
  )
  const live = reminders
    .map((reminder) => reminder.scheduleId)
    .filter((scheduleId) => !recorded.has(scheduleId))
    .sort()

  const final = new Set(
    (
      await db.all<{ installationId: string; scheduleId: string }>(sql`SELECT
          installation_id AS installationId, schedule_id AS scheduleId FROM delivery_attempts
        WHERE owner_id = ${ownerId} AND due_at = ${dueAt} AND outcome <> 'transient'`)
    ).map((row) => `${row.installationId}:${row.scheduleId}`),
  )
  const registrations = (
    await db
      .select({
        installationId: deviceRegistrations.installationId,
        token: deviceRegistrations.token,
      })
      .from(deviceRegistrations)
      .where(eq(deviceRegistrations.ownerId, ownerId))
  )
    .map((registration) => ({
      ...registration,
      scheduleIds: live.filter(
        (scheduleId) => !final.has(`${registration.installationId}:${scheduleId}`),
      ),
    }))
    .filter((registration) => registration.scheduleIds.length)
  const answers = await Promise.all(
    registrations.map((registration) =>
      submit(provider, { token: registration.token, dueAt, scheduleIds: registration.scheduleIds }),
    ),
  )
  const attempts = registrations.flatMap((registration, index) =>
    registration.scheduleIds.map((scheduleId) => ({
      id: crypto.randomUUID(),
      ownerId,
      scheduleId,
      dueAt,
      installationId: registration.installationId,
      outcome: answers[index].outcome,
      code: 'code' in answers[index] ? answers[index].code : null,
      attemptedAt: now.toISOString(),
    })),
  )
  for (const rows of chunks(attempts)) await db.insert(deliveryAttempts).values(rows)
  const unregistered = registrations.filter((_, index) => {
    const answer = answers[index]
    return answer.outcome === 'rejected' && UNREGISTERED_CODES.has(answer.code)
  })
  for (const registration of unregistered)
    await db
      .delete(deviceRegistrations)
      .where(
        and(
          eq(deviceRegistrations.installationId, registration.installationId),
          eq(deviceRegistrations.token, registration.token),
        ),
      )

  const retrying = new Set(
    attempts.filter((attempt) => attempt.outcome === 'transient').map((row) => row.scheduleId),
  )
  return Promise.all(
    reminders.map(({ scheduleId }) =>
      settle(
        scheduleId,
        recorded.has(scheduleId) ? 'dropped' : retrying.has(scheduleId) ? 'retrying' : 'submitted',
      ),
    ),
  )
}

// A thrown submission is transient, and only a status-code-shaped code is stored, so no
// provider message text (which could echo a token) reaches a Delivery attempt.
async function submit(provider: ReminderProvider, message: ReminderMessage) {
  let answer: ProviderAnswer
  try {
    answer = await provider.submit(message)
  } catch {
    return { outcome: 'transient', code: 'ERROR' } as const
  }
  if (answer.outcome === 'accepted') return { outcome: 'accepted' } as const
  return {
    outcome: answer.outcome,
    code: /^[A-Z][A-Z0-9_]{0,63}$/.test(answer.code) ? answer.code : 'UNKNOWN',
  }
}

function chunks<T>(rows: T[]) {
  const result: T[][] = []
  for (let index = 0; index < rows.length; index += ROWS_PER_INSERT)
    result.push(rows.slice(index, index + ROWS_PER_INSERT))
  return result
}
