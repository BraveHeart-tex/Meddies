// The due-reminder operation (#366, docs/product/reminders.md #30). Each run:
// 1. records every Occurrence whose Original reminder is due - from its due instant through due
//    +80 minutes inclusive (#9 D4) - for owners with a Device registration, once per Occurrence;
// 2. drops recorded reminders whose window has passed, unsent;
// 3. claims a bounded batch with one conditional UPDATE ... RETURNING that sets a fresh claim
//    token and lease (#5), so overlapping runs never claim the same reminder and an abandoned
//    claim becomes claimable again once its lease expires;
// 4. rechecks expiry and Taken/Skipped at processing time, then submits through the provider
//    port to each Device registration without a final answer for the Occurrence, recording one
//    Delivery attempt per submission.
// A transient answer releases the reminder for the next run inside its window; accepted and
// rejected answers are final for that Device registration. Only the claim token holder settles a
// reminder. An `UNREGISTERED` or `NOT_FOUND` answer removes that Device registration unless it has
// since been renewed with another token. Delivery attempts hold no registration token and no
// medication name, and this module logs nothing. The FCM provider is worker/fcm.ts.
import { and, eq, gte, isNull, lt, lte, or, sql } from 'drizzle-orm'
import type { DrizzleD1Database } from 'drizzle-orm/d1'
import { istanbulDate } from '../src/features/schedules/contract'
import { scheduleSlotsOn } from '../src/features/schedules/occurrences'
import { dailySchedules, deliveryAttempts, deviceRegistrations, originalReminders } from './schema'

/** One Original reminder for one Device registration; the Occurrence identifies its Reminder link. */
export type ReminderMessage = { token: string; scheduleId: string; dueAt: string }

/** The provider's answer; `code` is its status code, such as `UNREGISTERED` or `TIMEOUT`. */
export type ProviderAnswer =
  | { outcome: 'accepted' }
  | { outcome: 'rejected'; code: string }
  | { outcome: 'transient'; code: string }

/** Submits one reminder and settles within a bounded time, answering a timeout as transient. */
export type ReminderProvider = { submit(message: ReminderMessage): Promise<ProviderAnswer> }

/** Reminders this run settled or released; a claim lost to another run counts in none. */
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
  for (const rows of chunks(await dueOccurrences(db, now, windowStart)))
    await db.insert(originalReminders).values(rows).onConflictDoNothing()
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
    WHERE rowid IN (SELECT rowid FROM original_reminders
      WHERE state = 'pending' AND (lease_until IS NULL OR lease_until <= ${at})
        AND due_at >= ${windowStart} AND due_at <= ${at}
      ORDER BY due_at LIMIT ${batch})
    RETURNING owner_id AS ownerId, schedule_id AS scheduleId, due_at AS dueAt`)

  const run: DueReminderRun = { submitted: 0, dropped: 0, retrying: 0 }
  for (const reminder of claimed) {
    const result = await deliver(db, provider, clock, token, reminder)
    if (result) run[result]++
  }
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

async function deliver(
  db: DrizzleD1Database,
  provider: ReminderProvider,
  clock: () => Date,
  token: string,
  reminder: Reminder,
): Promise<keyof DueReminderRun | null> {
  const now = clock()
  // Settles only while this run still holds the claim; null once another run has reclaimed it.
  const settle = async (result: keyof DueReminderRun) => {
    const held = await db
      .update(originalReminders)
      .set(
        result === 'retrying'
          ? { claimToken: null, leaseUntil: null }
          : { claimToken: null, leaseUntil: null, state: result, settledAt: now.toISOString() },
      )
      .where(
        and(
          eq(originalReminders.ownerId, reminder.ownerId),
          eq(originalReminders.scheduleId, reminder.scheduleId),
          eq(originalReminders.dueAt, reminder.dueAt),
          eq(originalReminders.claimToken, token),
        ),
      )
      .returning({ dueAt: originalReminders.dueAt })
    return held.length ? result : null
  }
  if (
    now.getTime() > Date.parse(reminder.dueAt) + REMINDER_WINDOW_MS ||
    (await hasOutcome(db, reminder))
  )
    return settle('dropped')

  const registrations = await db
    .select({
      installationId: deviceRegistrations.installationId,
      token: deviceRegistrations.token,
    })
    .from(deviceRegistrations)
    .where(
      and(
        eq(deviceRegistrations.ownerId, reminder.ownerId),
        sql`NOT EXISTS (SELECT 1 FROM delivery_attempts
          WHERE delivery_attempts.owner_id = ${reminder.ownerId}
            AND delivery_attempts.schedule_id = ${reminder.scheduleId}
            AND delivery_attempts.due_at = ${reminder.dueAt}
            AND delivery_attempts.installation_id = ${deviceRegistrations.installationId}
            AND delivery_attempts.outcome <> 'transient')`,
      ),
    )
  const answers = await Promise.all(
    registrations.map((registration) =>
      submit(provider, {
        token: registration.token,
        scheduleId: reminder.scheduleId,
        dueAt: reminder.dueAt,
      }),
    ),
  )
  const attempts = registrations.map((registration, index) => ({
    id: crypto.randomUUID(),
    ownerId: reminder.ownerId,
    scheduleId: reminder.scheduleId,
    dueAt: reminder.dueAt,
    installationId: registration.installationId,
    outcome: answers[index].outcome,
    code: 'code' in answers[index] ? answers[index].code : null,
    attemptedAt: now.toISOString(),
  }))
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

  return settle(answers.some((answer) => answer.outcome === 'transient') ? 'retrying' : 'submitted')
}

async function hasOutcome(db: DrizzleD1Database, { ownerId, scheduleId, dueAt }: Reminder) {
  const row = await db.get<{ recorded: number }>(sql`SELECT EXISTS (
    SELECT 1 FROM dose_records WHERE owner_id = ${ownerId} AND schedule_id = ${scheduleId} AND due_at = ${dueAt}
    UNION ALL SELECT 1 FROM skipped_dose_records WHERE owner_id = ${ownerId} AND schedule_id = ${scheduleId} AND due_at = ${dueAt}
  ) AS recorded`)
  return Boolean(row?.recorded)
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
