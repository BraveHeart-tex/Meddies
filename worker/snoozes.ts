// The Snooze command (#36, docs/product/reminders.md #9 and #36). A Snooze of a Not logged dose
// reserves its earliest unused Follow-up reminder and targets it 40 minutes after accepting, in
// whole seconds; the due-reminder operation (worker/due-reminders.ts) sends it and drops the
// automatic reminders it rules out at send time.
// - An exact retry, read by its action ID before any time or occurrence check, returns its original
//   outcome; a reused action ID naming another dose is a conflict. A Snooze settled dropped at its
//   acceptance instant was accepted dropped.
// - Acceptance follows #9 D3: from the due instant through due +80 minutes inclusive, with a
//   Device registration, no Taken or Skipped, no pause, no newer Occurrence of the Medicine due, no
//   pending Snooze and an unused Follow-up reminder. Otherwise the answer names the reason and
//   nothing is written.
// - A Follow-up reminder is used once submitted, dropped, claimed under a live lease, answered
//   other than transiently, reserved or retired by a Snooze (#9 D2), retired as older at due +80,
//   or, with Quiet hours on, targeted inside them or due while processing would fall inside them.
// - A Snooze targeted inside Quiet hours is accepted already dropped and consumes its slot.
// - Races are arbitrated by one conditional insert: the slot key, the one-pending index and an
//   unchanged count of the Occurrence's Snoozes reject a concurrent reservation, and the slot's
//   automatic reminder must not be claimed or answered since evaluation. A lost race re-evaluates.
import { and, eq, sql } from 'drizzle-orm'
import type { DrizzleD1Database } from 'drizzle-orm/d1'
import { isQuietTime } from '../src/features/quiet-hours/contract'
import type { SnoozeRejection, SnoozeRequest, SnoozeResult } from '../src/features/snoozes/contract'
import { ApplicationError } from '../src/lib/application-error'
import { getOccurrence, validOccurrence } from './doses/occurrence'
import {
  FOLLOW_UP_INTERVAL_MS,
  REMINDER_WINDOW_MS,
  SNOOZE_LATENESS_MS,
  followUpTarget,
  newerOccurrence,
  retiredBySnooze,
  schedulePaused,
  windowOccurrences,
} from './due-reminders'
import { readQuietHours } from './quiet-hours'
import { deviceRegistrations, snoozes } from './schema'

const ATTEMPTS = 3

type Reservation = { reminder: 1 | 2; targetAt: string; dropped: boolean; snoozes: number }

export async function snoozeDose(
  db: DrizzleD1Database,
  ownerId: string,
  request: SnoozeRequest,
  clockNow: Date,
): Promise<SnoozeResult> {
  const now = new Date(Math.floor(clockNow.getTime() / 1000) * 1000)
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const prior = await receipt(db, ownerId, request)
    if (prior) return prior
    const decision = await evaluate(db, ownerId, request, now)
    if (typeof decision === 'string') return { outcome: 'rejected', reason: decision }
    if (await reserve(db, ownerId, request, decision, now))
      return { outcome: decision.dropped ? 'dropped' : 'snoozed', targetAt: decision.targetAt }
  }
  throw new ApplicationError('unavailable', 503)
}

async function receipt(
  db: DrizzleD1Database,
  ownerId: string,
  { actionId, scheduleId, dueAt }: SnoozeRequest,
): Promise<SnoozeResult | null> {
  const [row] = await db
    .select()
    .from(snoozes)
    .where(and(eq(snoozes.ownerId, ownerId), eq(snoozes.actionId, actionId)))
  if (!row) return null
  if (row.scheduleId !== scheduleId || row.dueAt !== dueAt)
    throw new ApplicationError('conflict', 409)
  const dropped = row.state === 'dropped' && row.settledAt === row.acceptedAt
  return { outcome: dropped ? 'dropped' : 'snoozed', targetAt: row.targetAt }
}

async function evaluate(
  db: DrizzleD1Database,
  ownerId: string,
  request: SnoozeRequest,
  now: Date,
): Promise<SnoozeRejection | Reservation> {
  const { scheduleId, dueAt } = request
  const at = now.toISOString()
  const schedule = await getOccurrence(db, ownerId, scheduleId, dueAt)
  if (!schedule || !validOccurrence(schedule, request, now)) return 'notFound'
  if (schedule.retainedOutcome) return 'logged'
  if (await schedulePaused(db, ownerId, scheduleId)) return 'paused'
  const elapsed = now.getTime() - Date.parse(dueAt)
  if (elapsed < 0) return 'notDue'
  if (elapsed > REMINDER_WINDOW_MS) return 'expired'
  const [registration] = await db
    .select({ id: deviceRegistrations.installationId })
    .from(deviceRegistrations)
    .where(eq(deviceRegistrations.ownerId, ownerId))
    .limit(1)
  if (!registration) return 'notificationsOff'
  if (
    newerOccurrence(await windowOccurrences(db, now, dueAt, ownerId))(
      ownerId,
      scheduleId,
      dueAt,
      now,
    )
  )
    return 'superseded'

  const occurrence = sql`owner_id = ${ownerId} AND schedule_id = ${scheduleId} AND due_at = ${dueAt}`
  const reserved = await db.all<{ reminder: number; targetAt: string; state: string }>(sql`SELECT
      reminder, target_at AS targetAt, state FROM snoozes WHERE ${occurrence}`)
  const lateStart = new Date(now.getTime() - SNOOZE_LATENESS_MS).toISOString()
  if (reserved.some((row) => row.state === 'pending' && row.targetAt >= lateStart)) return 'pending'
  const used = new Set(
    (
      await db.all<{ reminder: number }>(sql`SELECT reminder FROM follow_up_reminders
          WHERE ${occurrence}
            AND (state <> 'pending' OR (claim_token IS NOT NULL AND lease_until > ${at}))
        UNION SELECT reminder FROM delivery_attempts
          WHERE ${occurrence} AND reminder > 0 AND outcome <> 'transient'`)
    ).map((row) => row.reminder),
  )
  const { quietHours } = await readQuietHours(db, ownerId)
  const slots = ([1, 2] as const).filter(
    (reminder) =>
      !used.has(reminder) &&
      !retiredBySnooze(reminder, dueAt, reserved) &&
      !(reminder === 1 && elapsed >= REMINDER_WINDOW_MS),
  )
  const quiet = (reminder: 1 | 2) => {
    const target = followUpTarget(dueAt, reminder)
    return quietHours && (isQuietTime(target) || (target <= at && isQuietTime(at)))
  }
  const reminder = slots.find((slot) => !quiet(slot))
  if (!reminder) return slots.length ? 'quietHours' : 'exhausted'
  const targetAt = new Date(now.getTime() + FOLLOW_UP_INTERVAL_MS).toISOString()
  return {
    reminder,
    targetAt,
    dropped: quietHours && isQuietTime(targetAt),
    snoozes: reserved.length,
  }
}

// Inserts the Snooze, in one statement, only while the state `evaluate` read still holds; false
// when a race lost. A pending Snooze past its submission window is first dropped, as a run would.
async function reserve(
  db: DrizzleD1Database,
  ownerId: string,
  { actionId, scheduleId, dueAt }: SnoozeRequest,
  { reminder, targetAt, dropped, snoozes: count }: Reservation,
  now: Date,
) {
  const at = now.toISOString()
  const lateStart = new Date(now.getTime() - SNOOZE_LATENESS_MS).toISOString()
  const occurrence = sql`owner_id = ${ownerId} AND schedule_id = ${scheduleId} AND due_at = ${dueAt}`
  await db.run(sql`UPDATE snoozes
      SET state = 'dropped', settled_at = ${at}, claim_token = NULL, lease_until = NULL
      WHERE ${occurrence} AND state = 'pending' AND target_at < ${lateStart}
        AND (lease_until IS NULL OR lease_until <= ${at})`)
  const inserted =
    await db.run(sql`INSERT INTO snoozes (owner_id, schedule_id, due_at, reminder, action_id,
        accepted_at, target_at, state, settled_at)
      SELECT ${ownerId}, ${scheduleId}, ${dueAt}, ${reminder}, ${actionId}, ${at}, ${targetAt},
        ${dropped ? 'dropped' : 'pending'}, ${dropped ? at : null}
      WHERE (SELECT COUNT(*) FROM snoozes WHERE ${occurrence}) = ${count}
        AND NOT EXISTS (SELECT 1 FROM follow_up_reminders WHERE ${occurrence}
          AND reminder = ${reminder}
          AND (state <> 'pending' OR (claim_token IS NOT NULL AND lease_until > ${at})))
        AND NOT EXISTS (SELECT 1 FROM delivery_attempts WHERE ${occurrence}
          AND reminder = ${reminder} AND outcome <> 'transient')
      ON CONFLICT DO NOTHING`)
  return inserted.meta.changes > 0
}
