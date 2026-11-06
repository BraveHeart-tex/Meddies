import { and, eq, sql } from 'drizzle-orm'
import type { DrizzleD1Database } from 'drizzle-orm/d1'
import { ApplicationError } from '../../src/lib/application-error'
import type {
  DoseCorrectionInput,
  TakenDoseInput,
  SkippedDoseInput,
  DoseOutcomeRecord,
  DoseRecord,
  SkippedDoseRecord,
} from '../../src/features/schedules/contract'
import { doseCorrections, doseRecords, skippedDoseRecords } from '../schema'
import { getOccurrence, validOccurrence } from './occurrence'
import { takenColumns } from './queries'

export async function correctDoseOutcome(
  db: DrizzleD1Database,
  ownerId: string,
  correction: DoseCorrectionInput,
  now: Date,
): Promise<DoseOutcomeRecord> {
  // Replay precedes current-time validation and retains the original revision.
  const prior = await readCorrection(db, ownerId, correction.actionId)
  if (prior) {
    if (!sameCorrection(prior, correction)) throw new ApplicationError('conflict', 409)
    return correctionRecord(prior)
  }
  const schedule = await getOccurrence(db, ownerId, correction.scheduleId)
  if (
    !validOccurrence(schedule, correction, now) ||
    (correction.outcome === 'Taken' &&
      (Date.parse(correction.takenAt!) > now.getTime() ||
        (schedule?.unit === 'capsule' && !Number.isInteger(correction.quantity))))
  )
    throw new ApplicationError('validation', 400)
  const takenAt = correction.outcome === 'Taken' ? correction.takenAt : null
  const quantity = correction.outcome === 'Taken' ? correction.quantity : null
  // Atomic compare-and-append: the same statement checks the current outcome,
  // expected revision and immutable original. Unique revision/action keys arbitrate
  // competing corrections. Never replace these checks with application reads.
  const result = await db.run(sql`
    INSERT INTO dose_corrections (
      owner_id, schedule_id, due_at, revision, action_id,
      expected_outcome, outcome, taken_at, quantity, recorded_at
    )
    SELECT ${ownerId}, ${correction.scheduleId}, ${correction.dueAt},
      ${correction.expectedRevision + 1}, ${correction.actionId},
      ${correction.expectedOutcome}, ${correction.outcome},
      ${takenAt}, ${quantity}, ${now.toISOString()}
    WHERE COALESCE(
      (SELECT outcome FROM dose_corrections
       WHERE owner_id = ${ownerId} AND schedule_id = ${correction.scheduleId}
         AND due_at = ${correction.dueAt}
       ORDER BY revision DESC LIMIT 1),
      (SELECT outcome FROM (
         SELECT outcome FROM dose_records
         WHERE owner_id = ${ownerId} AND schedule_id = ${correction.scheduleId}
           AND due_at = ${correction.dueAt}
         UNION ALL
         SELECT outcome FROM skipped_dose_records
         WHERE owner_id = ${ownerId} AND schedule_id = ${correction.scheduleId}
           AND due_at = ${correction.dueAt}
       ) LIMIT 1),
      ''
    ) = ${correction.expectedOutcome}
    AND COALESCE(
      (SELECT MAX(revision) FROM dose_corrections
       WHERE owner_id = ${ownerId} AND schedule_id = ${correction.scheduleId}
         AND due_at = ${correction.dueAt}),
      0
    ) = ${correction.expectedRevision}
    AND EXISTS (
      SELECT 1 FROM dose_records
      WHERE owner_id = ${ownerId} AND schedule_id = ${correction.scheduleId}
        AND due_at = ${correction.dueAt}
      UNION ALL
      SELECT 1 FROM skipped_dose_records
      WHERE owner_id = ${ownerId} AND schedule_id = ${correction.scheduleId}
        AND due_at = ${correction.dueAt}
    )
    ON CONFLICT DO NOTHING
  `)
  if (!result.meta.changes) {
    // A zero-change insert may be an identical concurrent action; reconcile it here.
    const replay = await readCorrection(db, ownerId, correction.actionId)
    if (replay && sameCorrection(replay, correction)) return correctionRecord(replay)
    throw new ApplicationError('conflict', 409)
  }
  const key = {
    scheduleId: correction.scheduleId,
    dueAt: correction.dueAt,
    revision: correction.expectedRevision + 1,
    actionId: correction.actionId,
  }
  return correction.outcome === 'Taken'
    ? { ...key, outcome: 'Taken', takenAt: correction.takenAt, quantity: correction.quantity }
    : { ...key, outcome: 'Skipped', recordedAt: now.toISOString() }
}

async function readCorrection(db: DrizzleD1Database, ownerId: string, actionId: string) {
  return db
    .select()
    .from(doseCorrections)
    .where(and(eq(doseCorrections.ownerId, ownerId), eq(doseCorrections.actionId, actionId)))
    .get()
}

function sameCorrection(
  row: NonNullable<Awaited<ReturnType<typeof readCorrection>>>,
  correction: DoseCorrectionInput,
) {
  return (
    row.revision === correction.expectedRevision + 1 &&
    row.scheduleId === correction.scheduleId &&
    row.dueAt === correction.dueAt &&
    row.expectedOutcome === correction.expectedOutcome &&
    row.outcome === correction.outcome &&
    row.takenAt === (correction.outcome === 'Taken' ? correction.takenAt : null) &&
    row.quantity === (correction.outcome === 'Taken' ? correction.quantity : null)
  )
}

function correctionRecord(
  row: NonNullable<Awaited<ReturnType<typeof readCorrection>>>,
): DoseOutcomeRecord {
  const key = {
    scheduleId: row.scheduleId,
    dueAt: row.dueAt,
    revision: row.revision,
    actionId: row.actionId,
  }
  // Migration 0005's details CHECK guarantees Taken details are non-null.
  return row.outcome === 'Taken'
    ? { ...key, outcome: 'Taken', takenAt: row.takenAt!, quantity: row.quantity! }
    : { ...key, outcome: 'Skipped', recordedAt: row.recordedAt }
}

export async function recordTaken(
  db: DrizzleD1Database,
  ownerId: string,
  record: TakenDoseInput,
  now: Date,
): Promise<DoseRecord> {
  const occurrence = and(
    eq(doseRecords.ownerId, ownerId),
    eq(doseRecords.scheduleId, record.scheduleId),
    eq(doseRecords.dueAt, record.dueAt),
  )
  const readTaken = () => db.select(takenColumns).from(doseRecords).where(occurrence).get()
  const corrections = await db.all(
    sql`SELECT 1 FROM dose_corrections WHERE owner_id=${ownerId} AND schedule_id=${record.scheduleId} AND due_at=${record.dueAt} LIMIT 1`,
  )
  if (corrections.length) throw new ApplicationError('conflict', 409)
  const readSkipped = () =>
    db
      .select()
      .from(skippedDoseRecords)
      .where(
        and(
          eq(skippedDoseRecords.ownerId, ownerId),
          eq(skippedDoseRecords.scheduleId, record.scheduleId),
          eq(skippedDoseRecords.dueAt, record.dueAt),
        ),
      )
      .get()
  let saved = await readTaken()
  if (!saved) {
    if (await readSkipped()) throw new ApplicationError('conflict', 409)
    const schedule = await getOccurrence(db, ownerId, record.scheduleId)
    if (
      !validOccurrence(schedule, record, now) ||
      Date.parse(record.takenAt) > now.getTime() ||
      (schedule?.unit === 'capsule' && !Number.isInteger(record.quantity))
    )
      throw new ApplicationError('validation', 400)

    // Migration 0004's cross-outcome triggers RAISE(IGNORE) when Skipped wins.
    // Re-read below reconciles that race and identical concurrent Taken retries.
    await db
      .insert(doseRecords)
      .values({ ...record, ownerId, outcome: 'Taken' })
      .onConflictDoNothing({
        target: [doseRecords.ownerId, doseRecords.scheduleId, doseRecords.dueAt],
      })
    saved = await readTaken()
  }
  if (!saved || saved.takenAt !== record.takenAt || saved.quantity !== record.quantity)
    throw new ApplicationError('conflict', 409)
  return saved
}

export async function recordSkipped(
  db: DrizzleD1Database,
  ownerId: string,
  record: SkippedDoseInput,
  now: Date,
): Promise<SkippedDoseRecord> {
  const where = and(
    eq(skippedDoseRecords.ownerId, ownerId),
    eq(skippedDoseRecords.scheduleId, record.scheduleId),
    eq(skippedDoseRecords.dueAt, record.dueAt),
  )
  const readSkipped = () => db.select().from(skippedDoseRecords).where(where).get()
  const corrections = await db.all(
    sql`SELECT 1 FROM dose_corrections WHERE owner_id=${ownerId} AND schedule_id=${record.scheduleId} AND due_at=${record.dueAt} LIMIT 1`,
  )
  if (corrections.length) throw new ApplicationError('conflict', 409)
  const readTaken = () =>
    db
      .select()
      .from(doseRecords)
      .where(
        and(
          eq(doseRecords.ownerId, ownerId),
          eq(doseRecords.scheduleId, record.scheduleId),
          eq(doseRecords.dueAt, record.dueAt),
        ),
      )
      .get()
  let saved = await readSkipped()
  if (!saved) {
    if (await readTaken()) throw new ApplicationError('conflict', 409)
    const schedule = await getOccurrence(db, ownerId, record.scheduleId)
    if (!validOccurrence(schedule, record, now)) throw new ApplicationError('validation', 400)

    // Migration 0004's cross-outcome triggers RAISE(IGNORE) when Taken wins.
    // Re-read below distinguishes an identical retry from the opposite outcome.
    await db
      .insert(skippedDoseRecords)
      .values({ ...record, ownerId, recordedAt: now.toISOString(), outcome: 'Skipped' })
      .onConflictDoNothing({
        target: [
          skippedDoseRecords.ownerId,
          skippedDoseRecords.scheduleId,
          skippedDoseRecords.dueAt,
        ],
      })
    saved = await readSkipped()
  }
  if (!saved) {
    if (await readTaken()) throw new ApplicationError('conflict', 409)
    throw new ApplicationError('unavailable', 503)
  }
  return {
    scheduleId: saved.scheduleId,
    dueAt: saved.dueAt,
    recordedAt: saved.recordedAt,
    outcome: 'Skipped' as const,
  }
}
