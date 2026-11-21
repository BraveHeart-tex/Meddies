import type { DoseSnooze } from '../../src/features/snoozes/contract'
import { sql } from 'drizzle-orm'
import type { DrizzleD1Database } from 'drizzle-orm/d1'
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
  strengthRevisionId: string | null
  strength: string | null
  medicineLabel: string
  unit: string
}

export const takenColumns = {
  scheduleId: doseRecords.scheduleId,
  dueAt: doseRecords.dueAt,
  takenAt: doseRecords.takenAt,
  quantity: doseRecords.quantity,
  outcome: doseRecords.outcome,
  strengthRevisionId: doseRecords.strengthRevisionId,
  strength: doseRecords.strength,
  medicineLabel: doseRecords.medicineLabel,
  unit: doseRecords.unit,
}

// Effective latest outcome per occurrence; originals carry revision 0 and null
// action/opposite-outcome fields.
export async function listDoseOutcomes(db: DrizzleD1Database, ownerId: string, date: string) {
  const start = scheduledInstant(date, '00:00')
  const end = new Date(Date.parse(start) + 86_400_000).toISOString()
  const rows = await db.all<OutcomeRow>(sql`
    SELECT schedule_id AS scheduleId, due_at AS dueAt, taken_at AS takenAt,
      quantity, outcome, NULL AS recordedAt, 0 AS revision, NULL AS actionId, strength_revision_id AS strengthRevisionId, strength, medicine_label AS medicineLabel, unit
    FROM dose_records
    WHERE owner_id = ${ownerId} AND due_at >= ${start} AND due_at < ${end}
      AND NOT EXISTS (
        SELECT 1 FROM dose_corrections c WHERE c.owner_id = dose_records.owner_id
        AND c.schedule_id = dose_records.schedule_id AND c.due_at = dose_records.due_at)
    UNION ALL
    SELECT schedule_id AS scheduleId, due_at AS dueAt, NULL AS takenAt,
      NULL AS quantity, outcome, recorded_at AS recordedAt, 0 AS revision, NULL AS actionId, strength_revision_id AS strengthRevisionId, strength, medicine_label AS medicineLabel, unit
    FROM skipped_dose_records
    WHERE owner_id = ${ownerId} AND due_at >= ${start} AND due_at < ${end}
      AND NOT EXISTS (
        SELECT 1 FROM dose_corrections c WHERE c.owner_id = skipped_dose_records.owner_id
        AND c.schedule_id = skipped_dose_records.schedule_id AND c.due_at = skipped_dose_records.due_at)
    UNION ALL
    SELECT c.schedule_id AS scheduleId, c.due_at AS dueAt, c.taken_at AS takenAt, c.quantity,
      c.outcome, c.recorded_at AS recordedAt, c.revision, c.action_id AS actionId, c.strength_revision_id AS strengthRevisionId, c.strength, c.medicine_label AS medicineLabel, c.unit
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
    strengthRevisionId: row.strengthRevisionId,
    strength: row.strength,
    medicineLabel: row.medicineLabel,
    unit: row.unit,
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

// Reads never settle reminders. Only the latest reservation can describe the current result;
// a drop at acceptance is the Quiet hours receipt, never a later scheduler drop (#396).
export async function listDoseSnoozes(
  db: DrizzleD1Database,
  ownerId: string,
  date: string,
): Promise<DoseSnooze[]> {
  const start = scheduledInstant(date, '00:00')
  const end = new Date(Date.parse(start) + 86_400_000).toISOString()
  return db.all<DoseSnooze>(sql`
    SELECT s.schedule_id AS scheduleId, s.due_at AS dueAt, s.target_at AS targetAt,
      CASE WHEN s.state = 'pending' THEN 'pending' ELSE 'quietHours' END AS outcome
    FROM snoozes s
    WHERE s.owner_id = ${ownerId} AND s.due_at >= ${start} AND s.due_at < ${end}
      AND (s.state = 'pending' OR (s.state = 'dropped' AND s.settled_at = s.accepted_at))
      AND NOT EXISTS (
        SELECT 1 FROM snoozes newer WHERE newer.owner_id = s.owner_id
          AND newer.schedule_id = s.schedule_id AND newer.due_at = s.due_at
          AND newer.reminder > s.reminder
      )
  `)
}
