import { and, eq, gte, lt, sql } from 'drizzle-orm'
import type { DrizzleD1Database } from 'drizzle-orm/d1'
import { MedicineError } from '../src/features/medicines/contract'
import {
  istanbulDate,
  parseSkippedDose,
  parseTakenDose,
  parseDoseCorrection,
  scheduleRunsOn,
  type DoseOutcomeRecord,
} from '../src/features/schedules/contract'
import { scheduledInstant } from '../src/features/schedules/occurrences'
import {
  dailySchedules,
  doseCorrections,
  doseRecords,
  skippedDoseRecords,
  userMedications,
} from './schema'

const takenColumns = {
  scheduleId: doseRecords.scheduleId,
  dueAt: doseRecords.dueAt,
  takenAt: doseRecords.takenAt,
  quantity: doseRecords.quantity,
  outcome: doseRecords.outcome,
}

export async function listDoseRecords(db: DrizzleD1Database, ownerId: string, date: string) {
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

export async function listDoseOutcomes(db: DrizzleD1Database, ownerId: string, date: string) {
  const start = scheduledInstant(date, '00:00')
  const end = new Date(Date.parse(start) + 86_400_000).toISOString()
  return db.all(sql`
    SELECT schedule_id AS scheduleId, due_at AS dueAt, taken_at AS takenAt,
      quantity, outcome, NULL AS recordedAt, 0 AS revision, NULL AS actionId
    FROM dose_records
    WHERE owner_id = ${ownerId} AND due_at >= ${start} AND due_at < ${end}
      AND NOT EXISTS (SELECT 1 FROM dose_corrections c WHERE c.owner_id=dose_records.owner_id AND c.schedule_id=dose_records.schedule_id AND c.due_at=dose_records.due_at)
    UNION ALL
    SELECT schedule_id AS scheduleId, due_at AS dueAt, NULL AS takenAt,
      NULL AS quantity, outcome, recorded_at AS recordedAt, 0 AS revision, NULL AS actionId
    FROM skipped_dose_records
    WHERE owner_id = ${ownerId} AND due_at >= ${start} AND due_at < ${end}
      AND NOT EXISTS (SELECT 1 FROM dose_corrections c WHERE c.owner_id=skipped_dose_records.owner_id AND c.schedule_id=skipped_dose_records.schedule_id AND c.due_at=skipped_dose_records.due_at)
    UNION ALL
    SELECT c.schedule_id AS scheduleId, c.due_at AS dueAt, c.taken_at AS takenAt, c.quantity,
      c.outcome, c.recorded_at AS recordedAt, c.revision, c.action_id AS actionId
    FROM dose_corrections c
    WHERE c.owner_id=${ownerId} AND c.due_at >= ${start} AND c.due_at < ${end}
      AND c.revision=(SELECT MAX(latest.revision) FROM dose_corrections latest WHERE latest.owner_id=c.owner_id AND latest.schedule_id=c.schedule_id AND latest.due_at=c.due_at)
  `) as Promise<DoseOutcomeRecord[]>
}

export async function correctDoseOutcome(
  db: DrizzleD1Database,
  ownerId: string,
  input: unknown,
  now: Date,
) {
  const correction = parseDoseCorrection(input)
  const prior = await readCorrection(db, ownerId, correction.actionId)
  if (prior) {
    if (!sameCorrection(prior, correction)) throw new MedicineError('conflict', 409)
    return correctionRecord(prior)
  }
  const schedule = await getOccurrence(db, ownerId, correction.scheduleId)
  if (
    !validOccurrence(schedule, correction, now) ||
    (correction.outcome === 'Taken' &&
      (Date.parse(correction.takenAt!) > now.getTime() ||
        (schedule?.unit === 'capsule' && !Number.isInteger(correction.quantity))))
  )
    throw new MedicineError('validation', 400)
  const takenAt = correction.outcome === 'Taken' ? correction.takenAt : null
  const quantity = correction.outcome === 'Taken' ? correction.quantity : null
  const result =
    await db.run(sql`INSERT INTO dose_corrections(owner_id,schedule_id,due_at,revision,action_id,expected_outcome,outcome,taken_at,quantity,recorded_at)
    SELECT ${ownerId},${correction.scheduleId},${correction.dueAt},${correction.expectedRevision + 1},${correction.actionId},${correction.expectedOutcome},${correction.outcome},${takenAt},${quantity},${now.toISOString()}
    WHERE COALESCE((SELECT outcome FROM dose_corrections WHERE owner_id=${ownerId} AND schedule_id=${correction.scheduleId} AND due_at=${correction.dueAt} ORDER BY revision DESC LIMIT 1), (SELECT outcome FROM (SELECT outcome FROM dose_records WHERE owner_id=${ownerId} AND schedule_id=${correction.scheduleId} AND due_at=${correction.dueAt} UNION ALL SELECT outcome FROM skipped_dose_records WHERE owner_id=${ownerId} AND schedule_id=${correction.scheduleId} AND due_at=${correction.dueAt}) LIMIT 1), '')=${correction.expectedOutcome}
    AND COALESCE((SELECT MAX(revision) FROM dose_corrections WHERE owner_id=${ownerId} AND schedule_id=${correction.scheduleId} AND due_at=${correction.dueAt}),0)=${correction.expectedRevision}
    AND EXISTS (SELECT 1 FROM dose_records WHERE owner_id=${ownerId} AND schedule_id=${correction.scheduleId} AND due_at=${correction.dueAt} UNION ALL SELECT 1 FROM skipped_dose_records WHERE owner_id=${ownerId} AND schedule_id=${correction.scheduleId} AND due_at=${correction.dueAt})
    ON CONFLICT DO NOTHING`)
  if (!result.meta.changes) {
    const replay = await readCorrection(db, ownerId, correction.actionId)
    if (replay && sameCorrection(replay, correction)) return correctionRecord(replay)
    throw new MedicineError('conflict', 409)
  }
  return {
    scheduleId: correction.scheduleId,
    dueAt: correction.dueAt,
    outcome: correction.outcome,
    revision: correction.expectedRevision + 1,
    actionId: correction.actionId,
    ...(correction.outcome === 'Taken'
      ? { takenAt: correction.takenAt, quantity: correction.quantity }
      : { recordedAt: now.toISOString() }),
  }
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
  correction: ReturnType<typeof parseDoseCorrection>,
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

function correctionRecord(row: NonNullable<Awaited<ReturnType<typeof readCorrection>>>) {
  return {
    scheduleId: row.scheduleId,
    dueAt: row.dueAt,
    outcome: row.outcome,
    revision: row.revision,
    actionId: row.actionId,
    ...(row.outcome === 'Taken'
      ? { takenAt: row.takenAt!, quantity: row.quantity! }
      : { recordedAt: row.recordedAt }),
  }
}

async function getOccurrence(db: DrizzleD1Database, ownerId: string, scheduleId: string) {
  return db
    .select({
      startDate: dailySchedules.startDate,
      weekdays: dailySchedules.weekdays,
      endDate: dailySchedules.endDate,
      confirmedAt: dailySchedules.confirmedAt,
      times: dailySchedules.times,
      unit: userMedications.unit,
    })
    .from(dailySchedules)
    .innerJoin(
      userMedications,
      and(
        eq(userMedications.ownerId, dailySchedules.ownerId),
        eq(userMedications.id, dailySchedules.medicineId),
      ),
    )
    .where(and(eq(dailySchedules.ownerId, ownerId), eq(dailySchedules.id, scheduleId)))
    .get()
}

function validOccurrence(
  schedule: Awaited<ReturnType<typeof getOccurrence>>,
  record: { scheduleId: string; dueAt: string },
  now: Date,
) {
  const dueDate = istanbulDate(new Date(record.dueAt))
  return Boolean(
    schedule &&
    scheduleRunsOn(schedule, dueDate) &&
    dueDate <= istanbulDate(now) &&
    record.dueAt > schedule.confirmedAt &&
    schedule.times.some((slot) => scheduledInstant(dueDate, slot.time) === record.dueAt),
  )
}

export async function recordTaken(
  db: DrizzleD1Database,
  ownerId: string,
  input: unknown,
  now: Date,
) {
  const record = parseTakenDose(input)
  const occurrence = and(
    eq(doseRecords.ownerId, ownerId),
    eq(doseRecords.scheduleId, record.scheduleId),
    eq(doseRecords.dueAt, record.dueAt),
  )
  const readTaken = () => db.select(takenColumns).from(doseRecords).where(occurrence).get()
  const corrections = await db.all(
    sql`SELECT 1 FROM dose_corrections WHERE owner_id=${ownerId} AND schedule_id=${record.scheduleId} AND due_at=${record.dueAt} LIMIT 1`,
  )
  if (corrections.length) throw new MedicineError('conflict', 409)
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
    if (await readSkipped()) throw new MedicineError('conflict', 409)
    const schedule = await getOccurrence(db, ownerId, record.scheduleId)
    if (
      !validOccurrence(schedule, record, now) ||
      Date.parse(record.takenAt) > now.getTime() ||
      (schedule?.unit === 'capsule' && !Number.isInteger(record.quantity))
    )
      throw new MedicineError('validation', 400)

    await db
      .insert(doseRecords)
      .values({ ...record, ownerId, outcome: 'Taken' })
      .onConflictDoNothing({
        target: [doseRecords.ownerId, doseRecords.scheduleId, doseRecords.dueAt],
      })
    saved = await readTaken()
  }
  if (!saved || saved.takenAt !== record.takenAt || saved.quantity !== record.quantity)
    throw new MedicineError('conflict', 409)
  return saved
}

export async function recordSkipped(
  db: DrizzleD1Database,
  ownerId: string,
  input: unknown,
  now: Date,
) {
  const record = parseSkippedDose(input)
  const where = and(
    eq(skippedDoseRecords.ownerId, ownerId),
    eq(skippedDoseRecords.scheduleId, record.scheduleId),
    eq(skippedDoseRecords.dueAt, record.dueAt),
  )
  const readSkipped = () => db.select().from(skippedDoseRecords).where(where).get()
  const corrections = await db.all(
    sql`SELECT 1 FROM dose_corrections WHERE owner_id=${ownerId} AND schedule_id=${record.scheduleId} AND due_at=${record.dueAt} LIMIT 1`,
  )
  if (corrections.length) throw new MedicineError('conflict', 409)
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
    if (await readTaken()) throw new MedicineError('conflict', 409)
    const schedule = await getOccurrence(db, ownerId, record.scheduleId)
    if (!validOccurrence(schedule, record, now)) throw new MedicineError('validation', 400)

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
    if (await readTaken()) throw new MedicineError('conflict', 409)
    throw new MedicineError('unavailable', 503)
  }
  return {
    scheduleId: saved.scheduleId,
    dueAt: saved.dueAt,
    recordedAt: saved.recordedAt,
    outcome: 'Skipped' as const,
  }
}
