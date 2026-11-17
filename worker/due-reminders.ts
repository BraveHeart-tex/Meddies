// The due-reminder operation (#366, docs/product/reminders.md #30 and #31). An Occurrence has three
// reminders: its Original reminder at its due instant (reminder 0) and Follow-up reminders at due
// +40 and +80 minutes (1 and 2). Each run:
// 1. records, for every Occurrence due in the last 80 minutes inclusive whose owner has a Device
//    registration, only its current reminder - the one with the latest target at or before the
//    run - once per reminder, so a late run never bursts older ones (#9 D4);
// 2. drops recorded reminders, unsent, once a later one is due or due +80 minutes has passed;
// 3. claims a bounded batch of owners' due instants per reminder with one conditional
//    UPDATE ... RETURNING per table that sets a fresh claim token and lease (#5) on every
//    claimable reminder of each instant, so overlapping runs never claim the same reminder or
//    split an instant, and an abandoned claim becomes claimable again once its lease expires;
// 4. rechecks that the reminder is still current and Taken/Skipped per Occurrence at processing
//    time, then submits one reminder per due instant and reminder (#372) through the provider port
//    to each Device registration, covering the remaining Occurrences without a final answer for it,
//    and records one Delivery attempt per covered Occurrence naming the reminder and the answer.
// Suppression is that send-time recheck alone; recording a Dose outcome writes no reminder rows.
// An outcome that reaches the server after a claim and before the recheck stops that reminder
// (#32). One that arrives after the recheck may still be submitted, settles it as submitted with
// its Delivery attempts, and is never recalled: no provider takes a submission back.
// A reminder recorded after its instant was claimed is claimed, and sent, on its own; a reminder
// never shares a submission with another due instant's or another reminder number's. A transient
// answer releases the reminders it covers for the next run while they are current; accepted and
// rejected answers are final for that Device registration. Only the claim token holder settles a
// reminder. An `UNREGISTERED` or `NOT_FOUND` answer removes that Device registration unless it has
// since been renewed with another token. Processing time counts in whole seconds, the precision of
// the #9 timelines, so a run at 10:20:00.4 still submits a dose's 10:20 Follow-up reminder and one
// at 10:20:01 drops it. Delivery attempts hold no registration token and no medication name, and
// this module logs nothing. The FCM provider is worker/fcm.ts.
import { and, eq, gte, isNull, lt, lte, or, sql } from 'drizzle-orm'
import type { DrizzleD1Database } from 'drizzle-orm/d1'
import { istanbulDate } from '../src/features/schedules/contract'
import { scheduleSlotsOn } from '../src/features/schedules/occurrences'
import {
  dailySchedules,
  deliveryAttempts,
  deviceRegistrations,
  followUpReminders,
  originalReminders,
} from './schema'

/** 0 is an Occurrence's Original reminder; 1 and 2 its Follow-up reminders at due +40 and +80. */
export type ReminderNumber = 0 | 1 | 2

/**
 * One reminder for one Device registration: reminder `reminder` of the Occurrences of the
 * schedules in `scheduleIds` due at `dueAt`. One schedule gets its Occurrence's Reminder link;
 * several get the grouped Reminder link.
 */
export type ReminderMessage = {
  token: string
  dueAt: string
  reminder: ReminderNumber
  scheduleIds: string[]
}

/** The provider's answer; `code` is its status code, such as `UNREGISTERED` or `TIMEOUT`. */
export type ProviderAnswer =
  | { outcome: 'accepted' }
  | { outcome: 'rejected'; code: string }
  | { outcome: 'transient'; code: string }

/** Submits one reminder and settles within a bounded time, answering a timeout as transient. */
export type ReminderProvider = { submit(message: ReminderMessage): Promise<ProviderAnswer> }

/**
 * Reminders this run settled or released; a claim lost to another run counts in none.
 * `batch` bounds the due instants a run claims per table.
 */
export type DueReminderRun = { submitted: number; dropped: number; retrying: number }

/** No automatic reminder submits after due +80 minutes; at equality the last may (#9 D4). */
export const REMINDER_WINDOW_MS = 80 * 60_000
const FOLLOW_UP_INTERVAL_MS = 40 * 60_000
const LEASE_MS = 5 * 60_000
const DUE_REMINDER_BATCH = 25
const UNREGISTERED_CODES = new Set(['UNREGISTERED', 'NOT_FOUND'])
// D1 binds at most 100 parameters per statement.
const ROWS_PER_INSERT = 10

type Reminder = { ownerId: string; scheduleId: string; dueAt: string; reminder: ReminderNumber }

/** The reminder with the latest target at or before `now`, or null before due or after +80. */
function currentReminder(dueAt: string, now: Date): ReminderNumber | null {
  const elapsed = now.getTime() - Date.parse(dueAt)
  if (elapsed < 0 || elapsed > REMINDER_WINDOW_MS) return null
  return Math.floor(elapsed / FOLLOW_UP_INTERVAL_MS) as ReminderNumber
}

export async function runDueReminders(
  db: DrizzleD1Database,
  provider: ReminderProvider,
  clock: () => Date,
  batch = DUE_REMINDER_BATCH,
): Promise<DueReminderRun> {
  const seconds = () => new Date(Math.floor(clock().getTime() / 1000) * 1000)
  const now = seconds()
  const at = now.toISOString()
  const windowStart = new Date(now.getTime() - REMINDER_WINDOW_MS).toISOString()
  const followUpDue = new Date(now.getTime() - FOLLOW_UP_INTERVAL_MS).toISOString()

  const current = (await dueOccurrences(db, now, windowStart)).map((occurrence) => ({
    ...occurrence,
    reminder: currentReminder(occurrence.dueAt, now)!,
  }))
  const originals = current.filter((row) => row.reminder === 0)
  const followUps = current.filter((row) => row.reminder !== 0)
  // One batch, so a concurrent claim never sees an instant half recorded.
  const [first, ...rest] = [
    ...chunks(originals).map((rows) =>
      db
        .insert(originalReminders)
        .values(rows.map(({ reminder: _, ...row }) => row))
        .onConflictDoNothing(),
    ),
    ...chunks(followUps).map((rows) =>
      db.insert(followUpReminders).values(rows).onConflictDoNothing(),
    ),
  ]
  if (first) await db.batch([first, ...rest])

  const dropped = { state: 'dropped', settledAt: at, claimToken: null, leaseUntil: null } as const
  await db.batch([
    db
      .update(originalReminders)
      .set(dropped)
      .where(
        and(
          eq(originalReminders.state, 'pending'),
          lte(originalReminders.dueAt, followUpDue),
          or(isNull(originalReminders.leaseUntil), lte(originalReminders.leaseUntil, at)),
        ),
      ),
    db
      .update(followUpReminders)
      .set(dropped)
      .where(
        and(
          eq(followUpReminders.state, 'pending'),
          or(
            lt(followUpReminders.dueAt, windowStart),
            and(eq(followUpReminders.reminder, 1), lte(followUpReminders.dueAt, windowStart)),
          ),
          or(isNull(followUpReminders.leaseUntil), lte(followUpReminders.leaseUntil, at)),
        ),
      ),
  ])

  const token = crypto.randomUUID()
  const leaseUntil = new Date(now.getTime() + LEASE_MS).toISOString()
  const claim = (table: 'original_reminders' | 'follow_up_reminders') => {
    const original = table === 'original_reminders'
    const group = sql.raw(original ? 'owner_id, due_at' : 'owner_id, due_at, reminder')
    return db.all<Reminder>(sql`UPDATE ${sql.raw(table)}
      SET claim_token = ${token}, lease_until = ${leaseUntil}
      WHERE state = 'pending' AND (lease_until IS NULL OR lease_until <= ${at})
        AND (${group}) IN (SELECT ${group} FROM ${sql.raw(table)}
          WHERE state = 'pending' AND (lease_until IS NULL OR lease_until <= ${at})
            AND due_at >= ${windowStart} AND due_at <= ${at}
          GROUP BY ${group} ORDER BY due_at LIMIT ${batch})
      RETURNING owner_id AS ownerId, schedule_id AS scheduleId, due_at AS dueAt,
        ${sql.raw(original ? '0' : 'reminder')} AS reminder`)
  }
  const claimed = [...(await claim('original_reminders')), ...(await claim('follow_up_reminders'))]

  const instants = new Map<string, Reminder[]>()
  for (const reminder of [...claimed].sort(
    (a, b) => a.dueAt.localeCompare(b.dueAt) || a.reminder - b.reminder,
  )) {
    const key = `${reminder.ownerId}:${reminder.dueAt}:${reminder.reminder}`
    instants.set(key, [...(instants.get(key) ?? []), reminder])
  }
  const run: DueReminderRun = { submitted: 0, dropped: 0, retrying: 0 }
  for (const reminders of instants.values())
    for (const result of await deliver(db, provider, seconds, token, reminders))
      if (result) run[result]++
  return run
}

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

// Delivers one reminder of one owner's due instant: rechecks that it is still current and
// Taken/Skipped per Occurrence, then submits one reminder to each Device registration covering the
// remaining Occurrences without a final answer for it, recording one Delivery attempt per covered
// Occurrence with that answer.
async function deliver(
  db: DrizzleD1Database,
  provider: ReminderProvider,
  clock: () => Date,
  token: string,
  reminders: Reminder[],
): Promise<(keyof DueReminderRun | null)[]> {
  const now = clock()
  const { ownerId, dueAt, reminder } = reminders[0]
  const table = sql.raw(reminder ? 'follow_up_reminders' : 'original_reminders')
  const sameReminder = reminder ? sql`AND reminder = ${reminder}` : sql``
  // Settles only while this run still holds the claim; null once another run has reclaimed it.
  const settle = async (scheduleId: string, result: keyof DueReminderRun) => {
    const state =
      result === 'retrying' ? sql`` : sql`, state = ${result}, settled_at = ${now.toISOString()}`
    const held = await db.all(sql`UPDATE ${table}
      SET claim_token = NULL, lease_until = NULL ${state}
      WHERE owner_id = ${ownerId} AND schedule_id = ${scheduleId} AND due_at = ${dueAt}
        ${sameReminder} AND claim_token = ${token}
      RETURNING due_at`)
    return held.length ? result : null
  }
  if (currentReminder(dueAt, now) !== reminder)
    return Promise.all(reminders.map((row) => settle(row.scheduleId, 'dropped')))

  const recorded = new Set(
    (
      await db.all<{ scheduleId: string }>(sql`SELECT schedule_id AS scheduleId FROM dose_records
          WHERE owner_id = ${ownerId} AND due_at = ${dueAt}
        UNION SELECT schedule_id FROM skipped_dose_records
          WHERE owner_id = ${ownerId} AND due_at = ${dueAt}`)
    ).map((row) => row.scheduleId),
  )
  const live = reminders
    .map((row) => row.scheduleId)
    .filter((scheduleId) => !recorded.has(scheduleId))
    .sort()

  const final = new Set(
    (
      await db.all<{ installationId: string; scheduleId: string }>(sql`SELECT
          installation_id AS installationId, schedule_id AS scheduleId FROM delivery_attempts
        WHERE owner_id = ${ownerId} AND due_at = ${dueAt} AND reminder = ${reminder}
          AND outcome <> 'transient'`)
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
      submit(provider, {
        token: registration.token,
        dueAt,
        reminder,
        scheduleIds: registration.scheduleIds,
      }),
    ),
  )
  const attempts = registrations.flatMap((registration, index) =>
    registration.scheduleIds.map((scheduleId) => ({
      id: crypto.randomUUID(),
      ownerId,
      scheduleId,
      dueAt,
      reminder,
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
