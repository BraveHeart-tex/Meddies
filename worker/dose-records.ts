import { and, eq, gte, lt } from 'drizzle-orm'
import type { DrizzleD1Database } from 'drizzle-orm/d1'
import { MedicineError } from '../src/features/medicines/contract'
import { istanbulDate, parseTakenDose } from '../src/features/schedules/contract'
import { scheduledInstant } from '../src/features/schedules/occurrences'
import { dailySchedules, doseRecords, userMedications } from './schema'

const columns = {
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
    .select(columns)
    .from(doseRecords)
    .where(
      and(
        eq(doseRecords.ownerId, ownerId),
        gte(doseRecords.dueAt, start),
        lt(doseRecords.dueAt, end),
      ),
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
  const read = () => db.select(columns).from(doseRecords).where(occurrence).get()
  let saved = await read()
  if (!saved) {
    const schedule = await db
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
      .where(and(eq(dailySchedules.ownerId, ownerId), eq(dailySchedules.id, record.scheduleId)))
      .get()
    const dueDate = istanbulDate(new Date(record.dueAt))
    if (
      !schedule ||
      dueDate < schedule.startDate ||
      dueDate > istanbulDate(now) ||
      record.dueAt <= schedule.confirmedAt ||
      Date.parse(record.takenAt) > now.getTime() ||
      !schedule.times.some((slot) => scheduledInstant(dueDate, slot.time) === record.dueAt) ||
      (schedule.unit === 'capsule' && !Number.isInteger(record.quantity))
    )
      throw new MedicineError('validation', 400)

    await db
      .insert(doseRecords)
      .values({ ...record, ownerId, outcome: 'Taken' })
      .onConflictDoNothing({
        target: [doseRecords.ownerId, doseRecords.scheduleId, doseRecords.dueAt],
      })
    saved = await read()
  }
  if (!saved || saved.takenAt !== record.takenAt || saved.quantity !== record.quantity)
    throw new MedicineError('conflict', 409)
  return saved
}
