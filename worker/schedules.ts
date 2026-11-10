import { isQuantityForUnit } from '../src/lib/dose-quantity'
import { and, asc, eq, sql } from 'drizzle-orm'
import type { DrizzleD1Database } from 'drizzle-orm/d1'
import {
  istanbulDate,
  type DailySchedule,
  type ScheduleResponses,
  type parseSchedule,
  type ScheduleEditInput,
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
  intervalHours: dailySchedules.intervalHours,
  basedOnId: dailySchedules.basedOnId,
  replacedAt: sql<string | null>`(SELECT confirmed_at FROM daily_schedules successor
    WHERE successor.owner_id = daily_schedules.owner_id AND successor.based_on_id = daily_schedules.id)`.as(
    'replacedAt',
  ),
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
    saved.intervalHours === schedule.intervalHours &&
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

// The unique predecessor key makes compare-and-append atomic. No existing version
// or dose is mutated; the successor's confirmation time bounds the earlier version.
export async function editSchedule(
  db: DrizzleD1Database,
  ownerId: string,
  edit: ScheduleEditInput,
  clock: () => Date,
): Promise<ScheduleResponses['edit']> {
  const request = JSON.stringify(edit)
  const readSaved = () =>
    db
      .select({ ...scheduleColumns, editRequest: dailySchedules.editRequest })
      .from(dailySchedules)
      .where(and(eq(dailySchedules.ownerId, ownerId), eq(dailySchedules.id, edit.id)))
      .get()
  const replay = await readSaved()
  if (replay) {
    if (replay.editRequest !== request) throw new ApplicationError('conflict', 409)
    const { editRequest: _, ...saved } = replay
    return { schedules: [saved] }
  }
  const parent = await db
    .select({ ...scheduleColumns, unit: userMedications.unit })
    .from(dailySchedules)
    .innerJoin(
      userMedications,
      and(
        eq(userMedications.ownerId, dailySchedules.ownerId),
        eq(userMedications.id, dailySchedules.medicineId),
      ),
    )
    .where(and(eq(dailySchedules.ownerId, ownerId), eq(dailySchedules.id, edit.basedOnId)))
    .get()
  if (!parent) throw new ApplicationError('validation', 400)
  if (parent.replacedAt) throw new ApplicationError('conflict', 409)
  const now = clock()
  const today = istanbulDate(now)
  const interval = edit.intervalHours != null
  if (
    edit.times.some((slot) => !isQuantityForUnit(slot.quantity, parent.unit)) ||
    (edit.anchorDate !== undefined && edit.anchorDate < today) ||
    (interval && parent.intervalHours == null && !edit.anchorDate) ||
    (interval &&
      parent.intervalHours != null &&
      !edit.anchorDate &&
      edit.times[0].time !== parent.times[0].time)
  )
    throw new ApplicationError('validation', 400)
  const startDate = interval ? (edit.anchorDate ?? parent.startDate) : today
  await db.run(sql`
    INSERT INTO daily_schedules (owner_id, id, medicine_id, start_date, times, confirmed_at,
      weekdays, end_date, interval_hours, based_on_id, edit_request)
    SELECT ${ownerId}, ${edit.id}, ${parent.medicineId}, ${startDate}, ${JSON.stringify(edit.times)},
      ${now.toISOString()}, ${JSON.stringify(edit.weekdays)}, ${parent.endDate}, ${edit.intervalHours ?? null}, ${edit.basedOnId}, ${request}
    WHERE NOT EXISTS (SELECT 1 FROM daily_schedules WHERE owner_id = ${ownerId} AND based_on_id = ${edit.basedOnId})
    ON CONFLICT DO NOTHING
  `)
  const saved = await readSaved()
  if (!saved || saved.editRequest !== request) throw new ApplicationError('conflict', 409)
  const { editRequest: _, ...version } = saved
  return { schedules: [version] }
}
