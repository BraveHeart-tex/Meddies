import { and, eq, gte, lt, sql } from 'drizzle-orm'
import type { DrizzleD1Database } from 'drizzle-orm/d1'
import { MedicineError } from '../src/features/medicines/contract'
import {
  istanbulDate,
  parseSkippedDose,
  parseTakenDose,
  type DoseOutcomeRecord,
} from '../src/features/schedules/contract'
import { scheduledInstant } from '../src/features/schedules/occurrences'
import { dailySchedules, doseRecords, skippedDoseRecords, userMedications } from './schema'

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
      quantity, outcome, NULL AS recordedAt
    FROM dose_records
    WHERE owner_id = ${ownerId} AND due_at >= ${start} AND due_at < ${end}
    UNION ALL
    SELECT schedule_id AS scheduleId, due_at AS dueAt, NULL AS takenAt,
      NULL AS quantity, outcome, recorded_at AS recordedAt
    FROM skipped_dose_records
    WHERE owner_id = ${ownerId} AND due_at >= ${start} AND due_at < ${end}
  `) as Promise<DoseOutcomeRecord[]>
}

async function getOccurrence(db: DrizzleD1Database, ownerId: string, scheduleId: string) {
  return db
    .select({
      startDate: dailySchedules.startDate,
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
    dueDate >= schedule.startDate &&
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
