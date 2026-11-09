import { isQuantityForUnit } from '../src/lib/dose-quantity'
import { and, asc, eq } from 'drizzle-orm'
import type { DrizzleD1Database } from 'drizzle-orm/d1'
import {
  istanbulDate,
  type DailySchedule,
  type ScheduleResponses,
  type parseSchedule,
} from '../src/features/schedules/contract'
import { ApplicationError } from '../src/lib/application-error'
import { dailySchedules, userMedications } from './schema'
import { listDoseOutcomes, listDoseRecords } from './doses/queries'

const scheduleColumns = {
  id: dailySchedules.id,
  medicineId: dailySchedules.medicineId,
  startDate: dailySchedules.startDate,
  times: dailySchedules.times,
  confirmedAt: dailySchedules.confirmedAt,
  weekdays: dailySchedules.weekdays,
  endDate: dailySchedules.endDate,
}

async function listSchedules(db: DrizzleD1Database, ownerId: string): Promise<DailySchedule[]> {
  return db
    .select(scheduleColumns)
    .from(dailySchedules)
    .where(eq(dailySchedules.ownerId, ownerId))
    .orderBy(asc(dailySchedules.id))
}

// Legacy reads deliberately return immutable Taken originals, including corrected ones.
export async function listLegacySnapshot(
  db: DrizzleD1Database,
  ownerId: string,
  date?: string,
): Promise<ScheduleResponses['list']> {
  const records = date === undefined ? undefined : await listDoseRecords(db, ownerId, date)
  return { records, schedules: await listSchedules(db, ownerId) }
}

export async function listOutcomeSnapshot(db: DrizzleD1Database, ownerId: string, date: string) {
  const records = await listDoseOutcomes(db, ownerId, date)
  return { records, schedules: await listSchedules(db, ownerId) }
}

export async function saveSchedule(
  db: DrizzleD1Database,
  ownerId: string,
  schedule: ReturnType<typeof parseSchedule>,
  clock: () => Date,
): Promise<ScheduleResponses['save']> {
  const owner = eq(dailySchedules.ownerId, ownerId)
  const existing = await db
    .select(scheduleColumns)
    .from(dailySchedules)
    .where(and(owner, eq(dailySchedules.id, schedule.id)))
    .get()
  const matches = (saved: typeof existing) =>
    saved &&
    saved.medicineId === schedule.medicineId &&
    saved.startDate === schedule.startDate &&
    JSON.stringify(saved.weekdays) === JSON.stringify(schedule.weekdays) &&
    saved.endDate === schedule.endDate &&
    JSON.stringify(saved.times) === JSON.stringify(schedule.times)
  // An identical retry remains valid after the initial start date has passed.
  if (existing) {
    if (!matches(existing)) throw new ApplicationError('conflict', 409)
    return { schedules: [existing] }
  }
  const medicine = await db
    .select()
    .from(userMedications)
    .where(and(eq(userMedications.ownerId, ownerId), eq(userMedications.id, schedule.medicineId)))
    .get()
  if (!medicine || schedule.times.some((slot) => !isQuantityForUnit(slot.quantity, medicine.unit)))
    throw new ApplicationError('validation', 400)
  const now = clock()
  if (schedule.startDate < istanbulDate(now)) throw new ApplicationError('validation', 400)
  await db
    .insert(dailySchedules)
    .values({ ...schedule, ownerId, confirmedAt: now.toISOString() })
    .onConflictDoNothing()
  const saved = await db
    .select(scheduleColumns)
    .from(dailySchedules)
    .where(and(owner, eq(dailySchedules.id, schedule.id)))
    .get()
  if (!saved || !matches(saved)) throw new ApplicationError('conflict', 409)
  return { schedules: [saved] }
}
