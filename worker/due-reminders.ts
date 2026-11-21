// The due-reminder operation (#366, docs/product/reminders.md #30, #31, #34, #35, #36 and #37). An
// Occurrence has three reminders: its Original reminder at its due instant (reminder 0) and
// Follow-up reminders at due +40 and +80 minutes (1 and 2). A Snooze (worker/snoozes.ts) reserves
// one Follow-up reminder and targets it 40 minutes after accepting. Each run:
// 1. records, for every Occurrence due in the last 80 minutes inclusive whose owner has a Device
//    registration and with no newer Occurrence of its Medicine due by the run (#34), only its
//    current reminder - the one with the latest target at or before the run - once per reminder,
//    so a late run never bursts older ones (#9 D4);
// 2. drops recorded reminders, unsent, once a later one is due or due +80 minutes has passed, and
//    pending Snoozes more than 5 minutes past their target;
// 3. claims a bounded batch of owners' due instants per reminder, and of Snoozes due by the run,
//    with one conditional
//    UPDATE ... RETURNING per table that sets a fresh claim token and lease (#5) on every
//    claimable reminder of each instant, so overlapping runs never claim the same reminder or
//    split an instant, and an abandoned claim becomes claimable again once its lease expires;
// 4. rechecks that the reminder is still current, the owner's Quiet hours for a Follow-up reminder
//    or Snooze (#35), and Taken/Skipped, a Snooze and a newer Occurrence of the same Medicine per
//    Occurrence and the latest Schedule version's Last day at processing time, then submits one
//    reminder per due instant and reminder (#372), and one per Snooze covering only its Occurrence,
//    through the
//    provider port to each Device registration, covering the remaining Occurrences without a final
//    answer for it, and records one Delivery attempt per covered Occurrence naming the reminder
//    and the answer.
// With the owner's Medication names on (#37), read when a reminder is about to submit, its message
// also carries the current labels of the Medicines it covers, each once in label order; off, the
// message has no labels at all, so a generic submission never receives one. A rename or a
// preference change therefore applies to reminders already recorded but unsent.
// Suppression is that send-time recheck alone; recording a Dose outcome, a schedule change, a Quiet
// hours change or a Snooze writes no Original or Follow-up reminder rows, and dropping a reminder
// records no Dose outcome.
// A Snooze of an Occurrence drops its automatic reminders at send time (#9 D2, D4): the Original
// reminder, the Follow-up reminder it reserved and any older one, and the remaining Follow-up
// reminder when it would move past due +80 minutes. That moved target, 40 minutes after the Snooze's
// target, stays inside only for a Snooze accepted at the due instant, where it equals due +80, so
// the remaining reminder keeps its target or retires. A Snooze submits from its target through 5
// minutes later (#9 D5) and drops with Taken or Skipped, a paused Schedule, a newer Occurrence of
// its Medicine due by then, or Quiet hours at its target or processing time.
// With Quiet hours on, a Follow-up reminder whose target or processing time is inside 23:00 to
// 08:00 Istanbul drops; its slot is never replaced and nothing catches up at 08:00. Original
// reminders ignore Quiet hours. From 00:00 Istanbul after the latest Schedule version's Last day,
// all unsent reminders drop, including Snoozes; earlier Occurrences and Dose outcomes stay.
// A newer Occurrence counts from any Schedule version of the Medicine, even with an early Taken or
// Skipped, and at its due instant itself; Occurrences are those of Schedule versions running at
// the run's start, through the end of its Istanbul day, so a transient answer or an abandoned claim
// never submits an older reminder after a newer one is due.
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
// at 10:20:01 drops it. Delivery attempts hold no registration token and no Medicine label, and
// this module logs nothing. The FCM provider is worker/fcm.ts.
import { and, eq, gte, inArray, isNull, lt, lte, or, sql } from 'drizzle-orm'
import type { DrizzleD1Database } from 'drizzle-orm/d1'
import { istanbulDate } from '../src/features/schedules/contract'
import { scheduleSlotsOn } from '../src/features/schedules/occurrences'
import { isQuietTime } from '../src/features/quiet-hours/contract'
import { readQuietHours } from './quiet-hours'
import { readMedicationNames } from './medication-names'
import {
  dailySchedules,
  deliveryAttempts,
  deviceRegistrations,
  followUpReminders,
  originalReminders,
  userMedications,
  snoozes,
} from './schema'

/** 0 is an Occurrence's Original reminder; 1 and 2 its Follow-up reminders at due +40 and +80. */
export type ReminderNumber = 0 | 1 | 2

/**
 * One reminder for one Device registration: reminder `reminder` of the Occurrences of the
 * schedules in `scheduleIds` due at `dueAt`. One schedule gets its Occurrence's Reminder link;
 * several get the grouped Reminder link. `labels`, present only with Medication names on (#37),
 * names each Medicine covered once, in label order.
 */
export type ReminderMessage = {
  token: string
  dueAt: string
  reminder: ReminderNumber
  scheduleIds: string[]
  labels?: string[]
  /** A Snooze's target; set only on a Snooze's reminder, which covers one schedule. */
  snoozedTo?: string
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
/** A completed run is Healthy with no recent attempts or at least one accepted attempt or
 * device-gone rejection (`UNREGISTERED` or `NOT_FOUND`).
 * The inclusive 80-minute window spans all owners and includes this run's submissions.
 */
export async function isHealthyRun(db: DrizzleD1Database, now: Date): Promise<boolean> {
  const row = await db.get<{ healthy: number }>(sql`SELECT
    count(*) = 0 OR max(outcome = 'accepted'
      OR (outcome = 'rejected' AND code IN ('UNREGISTERED', 'NOT_FOUND'))) AS healthy
    FROM delivery_attempts
    WHERE attempted_at >= ${new Date(now.getTime() - REMINDER_WINDOW_MS).toISOString()}
      AND attempted_at <= ${now.toISOString()}`)
  return row?.healthy === 1
}

export const FOLLOW_UP_INTERVAL_MS = 40 * 60_000
/** A Snooze submits from its target through 5 minutes later inclusive (#9 D5). */
export const SNOOZE_LATENESS_MS = 5 * 60_000
// The latest Snooze, accepted at due +80 minutes, submits by due +125.
const OCCURRENCE_LOOKBACK_MS = REMINDER_WINDOW_MS + FOLLOW_UP_INTERVAL_MS + SNOOZE_LATENESS_MS
const LEASE_MS = 5 * 60_000
const DUE_REMINDER_BATCH = 25
const UNREGISTERED_CODES = new Set(['UNREGISTERED', 'NOT_FOUND'])
// D1 binds at most 100 parameters per statement.
const ROWS_PER_INSERT = 10

type Reminder = { ownerId: string; scheduleId: string; dueAt: string; reminder: ReminderNumber }
/** A claimed reminder; `targetAt` is set for a Snooze. */
type Claimed = Reminder & { targetAt?: string }
type SnoozeSlot = { reminder: number; targetAt: string }

/** The reminder with the latest target at or before `now`, or null before due or after +80. */
function currentReminder(dueAt: string, now: Date): ReminderNumber | null {
  const elapsed = now.getTime() - Date.parse(dueAt)
  if (elapsed < 0 || elapsed > REMINDER_WINDOW_MS) return null
  return Math.floor(elapsed / FOLLOW_UP_INTERVAL_MS) as ReminderNumber
}

/** Follow-up reminder `reminder`'s automatic target. */
export function followUpTarget(dueAt: string, reminder: ReminderNumber): string {
  return new Date(Date.parse(dueAt) + reminder * FOLLOW_UP_INTERVAL_MS).toISOString()
}

/**
 * Whether the Occurrence's Snoozes rule out automatic reminder `reminder` (#9 D2, D4): one
 * reserved it or a later Follow-up reminder, or one reserved an earlier one and moved this one
 * past due +80 minutes.
 */
export function retiredBySnooze(reminder: number, dueAt: string, snoozes: SnoozeSlot[]): boolean {
  const windowEnd = Date.parse(dueAt) + REMINDER_WINDOW_MS
  return snoozes.some(
    (snooze) =>
      snooze.reminder >= reminder ||
      Date.parse(snooze.targetAt) + FOLLOW_UP_INTERVAL_MS > windowEnd,
  )
}

/** Whether the latest version of a Schedule's version chain is paused. */
export async function schedulePaused(db: DrizzleD1Database, ownerId: string, scheduleId: string) {
  const [latest] = await db.all<{
    pausedAt: string | null
  }>(sql`WITH RECURSIVE chain(id, paused_at) AS (
      SELECT id, paused_at FROM daily_schedules WHERE owner_id = ${ownerId} AND id = ${scheduleId}
      UNION ALL SELECT successor.id, successor.paused_at FROM daily_schedules successor
        JOIN chain ON successor.owner_id = ${ownerId} AND successor.based_on_id = chain.id)
    SELECT paused_at AS pausedAt FROM chain WHERE NOT EXISTS (SELECT 1 FROM daily_schedules next
      WHERE next.owner_id = ${ownerId} AND next.based_on_id = chain.id)`)
  return !!latest?.pausedAt
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
  const lateStart = new Date(now.getTime() - SNOOZE_LATENESS_MS).toISOString()

  const occurrences = await windowOccurrences(
    db,
    now,
    new Date(now.getTime() - OCCURRENCE_LOOKBACK_MS).toISOString(),
  )
  const superseded = newerOccurrence(occurrences)
  const known = new Set(occurrences.map((row) => `${row.ownerId}:${row.scheduleId}:${row.dueAt}`))
  const context: Context = {
    superseded,
    present: (ownerId, scheduleId, dueAt) => known.has(`${ownerId}:${scheduleId}:${dueAt}`),
  }
  const current = occurrences
    .filter(
      (row) =>
        row.dueAt >= windowStart &&
        row.dueAt <= at &&
        !superseded(row.ownerId, row.scheduleId, row.dueAt, now),
    )
    .map(({ ownerId, scheduleId, dueAt }) => ({
      ownerId,
      scheduleId,
      dueAt,
      reminder: currentReminder(dueAt, now)!,
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
    db
      .update(snoozes)
      .set(dropped)
      .where(
        and(
          eq(snoozes.state, 'pending'),
          lt(snoozes.targetAt, lateStart),
          or(isNull(snoozes.leaseUntil), lte(snoozes.leaseUntil, at)),
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
  // Each Snooze is claimed, and sent, on its own.
  const claimSnoozes = () =>
    db.all<Claimed>(sql`UPDATE snoozes
      SET claim_token = ${token}, lease_until = ${leaseUntil}
      WHERE rowid IN (SELECT rowid FROM snoozes
        WHERE state = 'pending' AND (lease_until IS NULL OR lease_until <= ${at})
          AND target_at >= ${lateStart} AND target_at <= ${at}
        ORDER BY target_at LIMIT ${batch})
      RETURNING owner_id AS ownerId, schedule_id AS scheduleId, due_at AS dueAt, reminder,
        target_at AS targetAt`)
  const claimed: Claimed[] = [
    ...(await claim('original_reminders')),
    ...(await claim('follow_up_reminders')),
    ...(await claimSnoozes()),
  ]

  const instants = new Map<string, Claimed[]>()
  for (const reminder of [...claimed].sort(
    (a, b) => a.dueAt.localeCompare(b.dueAt) || a.reminder - b.reminder,
  )) {
    const key = reminder.targetAt
      ? `snooze:${reminder.ownerId}:${reminder.scheduleId}:${reminder.dueAt}:${reminder.reminder}`
      : `${reminder.ownerId}:${reminder.dueAt}:${reminder.reminder}`
    instants.set(key, [...(instants.get(key) ?? []), reminder])
  }
  const run: DueReminderRun = { submitted: 0, dropped: 0, retrying: 0 }
  for (const reminders of instants.values())
    for (const result of await deliver(db, provider, seconds, token, context, reminders))
      if (result) run[result]++
  return run
}

type Superseded = (ownerId: string, scheduleId: string, dueAt: string, now: Date) => boolean
type Context = {
  superseded: Superseded
  /** Whether the Occurrence is one of a running Schedule version of an owner with a registration. */
  present: (ownerId: string, scheduleId: string, dueAt: string) => boolean
}

// Occurrences due from the window's start through the end of today, from Schedule versions that run
// in it, of owners with a Device registration, or of `ownerId` alone; a version's occurrences end
// at its successor's Edit time (docs/architecture.md Occurrences).
export async function windowOccurrences(
  db: DrizzleD1Database,
  now: Date,
  windowStart: string,
  ownerId?: string,
) {
  const at = now.toISOString()
  const today = istanbulDate(now)
  const dates = [...new Set([istanbulDate(new Date(windowStart)), today])]
  const schedules = await db
    .select({
      ownerId: dailySchedules.ownerId,
      id: dailySchedules.id,
      medicineId: dailySchedules.medicineId,
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
        ownerId ? eq(dailySchedules.ownerId, ownerId) : undefined,
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
            dueAt > schedule.confirmedAt &&
            (!schedule.replacedAt || dueAt <= schedule.replacedAt),
        )
        .map((dueAt) => ({
          ownerId: schedule.ownerId,
          medicineId: schedule.medicineId,
          scheduleId: schedule.id,
          dueAt,
        })),
    ),
  )
}

// Whether an Occurrence of the same Medicine, from any Schedule version, is due after `dueAt` and
// by `now` (#34). A schedule with no Occurrence in `occurrences` is never superseded here.
export function newerOccurrence(
  occurrences: Awaited<ReturnType<typeof windowOccurrences>>,
): Superseded {
  const medicineOf = new Map<string, string>()
  const dues = new Map<string, string[]>()
  for (const { ownerId, medicineId, scheduleId, dueAt } of occurrences) {
    const medicine = `${ownerId}:${medicineId}`
    medicineOf.set(`${ownerId}:${scheduleId}`, medicine)
    dues.set(medicine, [...(dues.get(medicine) ?? []), dueAt])
  }
  return (ownerId, scheduleId, dueAt, now) => {
    const medicine = medicineOf.get(`${ownerId}:${scheduleId}`)
    const at = now.toISOString()
    return !!medicine && dues.get(medicine)!.some((due) => due > dueAt && due <= at)
  }
}

// Delivers one reminder of one owner's due instant, or one Snooze: rechecks that it is still
// current, and Taken/Skipped, a Snooze, a pause and a newer same-Medicine Occurrence per Occurrence,
// then submits one reminder to each Device registration covering the remaining Occurrences without
// a final answer for it, recording one Delivery attempt per covered Occurrence with that answer.
async function deliver(
  db: DrizzleD1Database,
  provider: ReminderProvider,
  clock: () => Date,
  token: string,
  { superseded, present }: Context,
  reminders: Claimed[],
): Promise<(keyof DueReminderRun | null)[]> {
  const now = clock()
  const { ownerId, dueAt, reminder, targetAt } = reminders[0]
  const table = sql.raw(
    targetAt ? 'snoozes' : reminder ? 'follow_up_reminders' : 'original_reminders',
  )
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
  const stale = targetAt
    ? now.getTime() < Date.parse(targetAt) ||
      now.getTime() > Date.parse(targetAt) + SNOOZE_LATENESS_MS
    : currentReminder(dueAt, now) !== reminder
  if (
    stale ||
    (reminder && (await quietDrop(db, ownerId, targetAt ?? followUpTarget(dueAt, reminder), now)))
  )
    return Promise.all(reminders.map((row) => settle(row.scheduleId, 'dropped')))

  const stopped = new Set(
    (
      await db.all<{ scheduleId: string }>(sql`SELECT schedule_id AS scheduleId FROM dose_records
          WHERE owner_id = ${ownerId} AND due_at = ${dueAt}
        UNION SELECT schedule_id FROM skipped_dose_records
          WHERE owner_id = ${ownerId} AND due_at = ${dueAt}`)
    )
      .map((row) => row.scheduleId)
      .concat(
        reminders
          .map((row) => row.scheduleId)
          .filter((scheduleId) => superseded(ownerId, scheduleId, dueAt, now)),
      )
      .concat(
        await endedReminders(
          db,
          ownerId,
          reminders.map((row) => row.scheduleId),
          now,
        ),
      )
      .concat(
        targetAt
          ? await snoozeStops(db, ownerId, reminders[0].scheduleId, dueAt, present)
          : await snoozedReminders(db, ownerId, dueAt, reminder),
      ),
  )
  const live = reminders
    .map((row) => row.scheduleId)
    .filter((scheduleId) => !stopped.has(scheduleId))
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
  const labelsOf = registrations.length ? await medicineLabels(db, ownerId, live) : null
  const answers = await Promise.all(
    registrations.map((registration) =>
      submit(provider, {
        token: registration.token,
        dueAt,
        reminder,
        scheduleIds: registration.scheduleIds,
        ...(labelsOf && { labels: labelsOf(registration.scheduleIds) }),
        ...(targetAt ? { snoozedTo: targetAt } : {}),
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
        stopped.has(scheduleId) ? 'dropped' : retrying.has(scheduleId) ? 'retrying' : 'submitted',
      ),
    ),
  )
}

// The schedules of an owner's due instant whose Snoozes rule out automatic reminder `reminder`.
async function snoozedReminders(
  db: DrizzleD1Database,
  ownerId: string,
  dueAt: string,
  reminder: ReminderNumber,
) {
  const rows = await db.all<SnoozeSlot & { scheduleId: string }>(sql`SELECT
      schedule_id AS scheduleId, reminder, target_at AS targetAt FROM snoozes
    WHERE owner_id = ${ownerId} AND due_at = ${dueAt}`)
  return [...new Set(rows.map((row) => row.scheduleId))].filter((scheduleId) =>
    retiredBySnooze(
      reminder,
      dueAt,
      rows.filter((row) => row.scheduleId === scheduleId),
    ),
  )
}

// Last day changes govern retained Occurrences too, so read each chain's latest version at
// send time. A Last day is inclusive in Istanbul; equality still permits reminders that day.
async function endedReminders(
  db: DrizzleD1Database,
  ownerId: string,
  scheduleIds: string[],
  now: Date,
) {
  const rows = await db.all<{
    scheduleId: string
  }>(sql`WITH RECURSIVE chain(schedule_id, id, end_date) AS (
      SELECT id, id, end_date FROM daily_schedules
        WHERE owner_id = ${ownerId} AND id IN (SELECT value FROM json_each(${JSON.stringify(scheduleIds)}))
      UNION ALL SELECT chain.schedule_id, successor.id, successor.end_date
        FROM daily_schedules successor JOIN chain ON successor.based_on_id = chain.id
        WHERE successor.owner_id = ${ownerId})
    SELECT schedule_id AS scheduleId FROM chain
      WHERE end_date < ${istanbulDate(now)} AND NOT EXISTS (
        SELECT 1 FROM daily_schedules next
          WHERE next.owner_id = ${ownerId} AND next.based_on_id = chain.id)`)
  return rows.map((row) => row.scheduleId)
}

// A Snooze's schedule when its Schedule is paused or its Occurrence is no longer a running one.
async function snoozeStops(
  db: DrizzleD1Database,
  ownerId: string,
  scheduleId: string,
  dueAt: string,
  present: Context['present'],
) {
  return !present(ownerId, scheduleId, dueAt) || (await schedulePaused(db, ownerId, scheduleId))
    ? [scheduleId]
    : []
}

// With the owner's Quiet hours on, a Follow-up reminder or Snooze drops when its target or its
// processing time is inside the window (#35, #9 D5). The preference is read here, at send time.
async function quietDrop(db: DrizzleD1Database, ownerId: string, target: string, now: Date) {
  if (!isQuietTime(target) && !isQuietTime(now.toISOString())) return false
  return (await readQuietHours(db, ownerId)).quietHours
}

// With the owner's Medication names on, the current labels of the Medicines of `scheduleIds`, each
// once in label order (#37); null when off. Both are read here, at send time.
async function medicineLabels(db: DrizzleD1Database, ownerId: string, scheduleIds: string[]) {
  if (!scheduleIds.length || !(await readMedicationNames(db, ownerId)).medicationNames) return null
  const rows = await db
    .select({
      scheduleId: dailySchedules.id,
      medicineId: userMedications.id,
      label: userMedications.label,
    })
    .from(dailySchedules)
    .innerJoin(
      userMedications,
      and(
        eq(userMedications.ownerId, dailySchedules.ownerId),
        eq(userMedications.id, dailySchedules.medicineId),
      ),
    )
    .where(and(eq(dailySchedules.ownerId, ownerId), inArray(dailySchedules.id, scheduleIds)))
  const medicineOf = new Map(rows.map((row) => [row.scheduleId, row]))
  const order = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)
  return (covered: string[]) =>
    [
      ...new Map(
        covered.flatMap((id) => medicineOf.get(id) ?? []).map((row) => [row.medicineId, row]),
      ).values(),
    ]
      .sort((a, b) => order(a.label, b.label) || order(a.medicineId, b.medicineId))
      .map((row) => row.label)
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
