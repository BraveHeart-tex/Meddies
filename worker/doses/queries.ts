import { and, eq, gte, lt, sql } from 'drizzle-orm'
import type { DrizzleD1Database } from 'drizzle-orm/d1'
import type { DoseRecord } from '../../src/features/schedules/contract'
import { scheduledInstant } from '../../src/features/schedules/occurrences'
import { doseRecords } from '../schema'

// The snapshot wire contract includes nullable opposite-outcome fields. Mutation
// responses omit them; app gateways decode either form into DoseOutcomeRecord.
type OutcomeRow = {
  scheduleId: string
  dueAt: string
  takenAt: string | null
  quantity: number | null
  outcome: 'Taken' | 'Skipped'
  recordedAt: string | null
  revision: number
  actionId: string | null
}

export const takenColumns = {
  scheduleId: doseRecords.scheduleId,
  dueAt: doseRecords.dueAt,
  takenAt: doseRecords.takenAt,
  quantity: doseRecords.quantity,
  outcome: doseRecords.outcome,
}

// Legacy read contract: Taken originals, including originals later corrected (the
// snapshot omits `records` without a date). Worker refactors retain this wire form.
export async function listDoseRecords(
  db: DrizzleD1Database,
  ownerId: string,
  date: string,
): Promise<DoseRecord[]> {
  const start = scheduledInstant(date, '00:00')
  const end = new Date(Date.parse(start) + 86_400_000).toISOString()
  return db
    .select(takenColumns)
    .from(doseRecords)
    .where(
      and(
        eq(doseRecords.ownerId, ownerId),
        gte(doseRecords.dueAt, start),
        lt(doseRecords.dueAt, end),
      ),
    )
}

// Effective latest outcome per occurrence; originals carry revision 0 and null
// action/opposite-outcome fields.
export async function listDoseOutcomes(db: DrizzleD1Database, ownerId: string, date: string) {
  const start = scheduledInstant(date, '00:00')
  const end = new Date(Date.parse(start) + 86_400_000).toISOString()
  const rows = await db.all<OutcomeRow>(sql`
    SELECT schedule_id AS scheduleId, due_at AS dueAt, taken_at AS takenAt,
      quantity, outcome, NULL AS recordedAt, 0 AS revision, NULL AS actionId
    FROM dose_records
    WHERE owner_id = ${ownerId} AND due_at >= ${start} AND due_at < ${end}
      AND NOT EXISTS (
        SELECT 1 FROM dose_corrections c WHERE c.owner_id = dose_records.owner_id
        AND c.schedule_id = dose_records.schedule_id AND c.due_at = dose_records.due_at)
    UNION ALL
    SELECT schedule_id AS scheduleId, due_at AS dueAt, NULL AS takenAt,
      NULL AS quantity, outcome, recorded_at AS recordedAt, 0 AS revision, NULL AS actionId
    FROM skipped_dose_records
    WHERE owner_id = ${ownerId} AND due_at >= ${start} AND due_at < ${end}
      AND NOT EXISTS (
        SELECT 1 FROM dose_corrections c WHERE c.owner_id = skipped_dose_records.owner_id
        AND c.schedule_id = skipped_dose_records.schedule_id AND c.due_at = skipped_dose_records.due_at)
    UNION ALL
    SELECT c.schedule_id AS scheduleId, c.due_at AS dueAt, c.taken_at AS takenAt, c.quantity,
      c.outcome, c.recorded_at AS recordedAt, c.revision, c.action_id AS actionId
    FROM dose_corrections c
    WHERE c.owner_id = ${ownerId} AND c.due_at >= ${start} AND c.due_at < ${end}
      AND c.revision = (
        SELECT MAX(latest.revision) FROM dose_corrections latest
        WHERE latest.owner_id = c.owner_id AND latest.schedule_id = c.schedule_id
          AND latest.due_at = c.due_at
      )
  `)
  // Keep the historical null fields and zero revision on original snapshot rows.
  return rows.map((row) => ({
    scheduleId: row.scheduleId,
    dueAt: row.dueAt,
    takenAt: row.takenAt,
    quantity: row.quantity,
    outcome: row.outcome,
    recordedAt: row.recordedAt,
    revision: row.revision,
    actionId: row.actionId,
  }))
}
