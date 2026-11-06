import { and, eq } from 'drizzle-orm'
import type { DrizzleD1Database } from 'drizzle-orm/d1'
import { istanbulDate, scheduleRunsOn } from '../../src/features/schedules/contract'
import { scheduledInstant } from '../../src/features/schedules/occurrences'
import { dailySchedules, userMedications } from '../schema'

export async function getOccurrence(db: DrizzleD1Database, ownerId: string, scheduleId: string) {
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

export function validOccurrence(
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
