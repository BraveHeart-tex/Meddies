// Refill pushes (#457) freeze an episode's owner-scoped Device registrations atomically, even
// when the set is empty. Each Delivery attempt rechecks the episode, its budget, saved Stock,
// and the registration, and reads current Medication names and label at the provider boundary.
// The durable indeterminate row is written before submission. A competing run cannot repeat
// it, and interruption leaves it spent. A known retryable failure permits a new attempt.
// The first enabled scheduler run forfeits existing budgets atomically (#458).
// Quiet hours defer selection and claims; each write checks the current account preference.
// A run starts a target only while its claim and settlement fit the scheduler's D1 budget (#461);
// a deferred target has no attempt and stays eligible for the next run.
import { isQuietTime } from '../src/features/quiet-hours/contract'
import type { Admits } from './d1-budget'

export async function activateRefillPushes(db: D1Database): Promise<void> {
  await db.prepare('INSERT OR IGNORE INTO refill_push_activation(id) VALUES (1)').run()
}

export type RefillMessage = { token: string; label?: string }
type RefillOutcome = 'accepted' | 'indeterminate' | 'retryable' | 'rejected'

export type RefillProvider = {
  submitRefill(begin: () => Promise<RefillMessage | null>): Promise<RefillOutcome | undefined>
}

const BATCH_SIZE = 25
// Target selection and the candidate read, then one claim and one settlement per target.
const SETUP_CALLS = 2
const TARGET_CALLS = 2
const quietHoursOff = `NOT EXISTS (
  SELECT 1 FROM account_preferences p WHERE p.owner_id = e.owner_id AND p.quiet_hours = 1
)`

type Target = {
  episode_id: string
  installation_id: string
  previous_attempt_id: number | null
}

export async function runRefillPushes(
  db: D1Database,
  provider: RefillProvider,
  clock: () => Date,
  admits: Admits = () => true,
): Promise<void> {
  if (!admits(SETUP_CALLS + TARGET_CALLS)) return
  const inQuietHours = () => Number(isQuietTime(clock().toISOString()))
  await db
    .prepare(
      `UPDATE low_stock_episodes SET targets_selected = 1 WHERE id IN (
       SELECT e.id FROM eligible_refill_episodes e
       WHERE e.targets_selected = 0 AND (? = 0 OR ${quietHoursOff})
       ORDER BY e.id LIMIT ?
     )`,
    )
    .bind(inQuietHours(), BATCH_SIZE)
    .run()

  const { results: targets } = await db
    .prepare(
      `SELECT t.episode_id, t.installation_id, t.previous_attempt_id FROM eligible_refill_targets t
     JOIN eligible_refill_episodes e ON e.id = t.episode_id
     WHERE ? = 0 OR ${quietHoursOff}
     ORDER BY t.previous_attempt_id, t.episode_id, t.installation_id LIMIT ?`,
    )
    .bind(inQuietHours(), BATCH_SIZE)
    .all<Target>()

  for (const target of targets) {
    if (!admits(TARGET_CALLS)) break
    let attemptId: number | undefined
    const outcome = await provider.submitRefill(async () => {
      const attempt = await db
        .prepare(
          `INSERT INTO refill_delivery_attempts(episode_id, installation_id, outcome)
         SELECT t.episode_id, t.installation_id, 'indeterminate' FROM eligible_refill_targets t
         JOIN eligible_refill_episodes e ON e.id = t.episode_id
         WHERE t.episode_id = ?1 AND t.installation_id = ?2 AND t.previous_attempt_id IS ?3
           AND (?4 = 0 OR ${quietHoursOff})
         RETURNING id,
           (SELECT token FROM device_registrations WHERE installation_id = ?2) AS token,
           (SELECT e.label FROM eligible_refill_episodes e
             JOIN account_preferences p ON p.owner_id = e.owner_id AND p.medication_names = 1
             WHERE e.id = ?1) AS label`,
        )
        .bind(target.episode_id, target.installation_id, target.previous_attempt_id, inQuietHours())
        .first<{ id: number; token: string; label: string | null }>()
      if (!attempt) return null
      attemptId = attempt.id
      return { token: attempt.token, label: attempt.label ?? undefined }
    })
    if (attemptId !== undefined && outcome && outcome !== 'indeterminate') {
      await db
        .prepare('UPDATE refill_delivery_attempts SET outcome = ? WHERE id = ?')
        .bind(outcome, attemptId)
        .run()
    }
  }
}
