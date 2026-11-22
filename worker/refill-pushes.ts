// Refill pushes (#457) freeze an episode's owner-scoped Device registrations atomically, even
// when the set is empty. Each Delivery attempt rechecks the episode, its budget, saved Stock,
// and the registration, and reads current Medication names and label at the provider boundary.
// The durable indeterminate row is written before submission. A competing run cannot repeat
// it, and interruption leaves it spent. A known retryable failure permits a new attempt.
// The scheduler will wire this operation when #54 adds Quiet hours and activates refill pushes.
export type RefillMessage = { token: string; label?: string }
type RefillOutcome = 'accepted' | 'indeterminate' | 'retryable' | 'rejected'

export type RefillProvider = {
  submitRefill(begin: () => Promise<RefillMessage | null>): Promise<RefillOutcome | undefined>
}

const BATCH_SIZE = 25

type Target = {
  episode_id: string
  installation_id: string
  previous_attempt_id: number | null
}

export async function runRefillPushes(db: D1Database, provider: RefillProvider): Promise<void> {
  await db
    .prepare(
      `UPDATE low_stock_episodes SET targets_selected = 1 WHERE id IN (
       SELECT id FROM eligible_refill_episodes WHERE targets_selected = 0 ORDER BY id LIMIT ?
     )`,
    )
    .bind(BATCH_SIZE)
    .run()

  const { results: targets } = await db
    .prepare(
      `SELECT episode_id, installation_id, previous_attempt_id FROM eligible_refill_targets
     ORDER BY previous_attempt_id, episode_id, installation_id LIMIT ?`,
    )
    .bind(BATCH_SIZE)
    .all<Target>()

  for (const target of targets) {
    let attemptId: number | undefined
    const outcome = await provider.submitRefill(async () => {
      const attempt = await db
        .prepare(
          `INSERT INTO refill_delivery_attempts(episode_id, installation_id, outcome)
         SELECT episode_id, installation_id, 'indeterminate' FROM eligible_refill_targets
         WHERE episode_id = ?1 AND installation_id = ?2 AND previous_attempt_id IS ?3
         RETURNING id,
           (SELECT token FROM device_registrations WHERE installation_id = ?2) AS token,
           (SELECT e.label FROM eligible_refill_episodes e
             JOIN account_preferences p ON p.owner_id = e.owner_id AND p.medication_names = 1
             WHERE e.id = ?1) AS label`,
        )
        .bind(target.episode_id, target.installation_id, target.previous_attempt_id)
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
