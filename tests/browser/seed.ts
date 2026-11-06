import { randomUUID } from 'node:crypto'
import type { JourneyDatabase } from './fixtures'

type Slot = { time: string; quantity: number }

/** Insert a medicine with a daily schedule confirmed at the start of `startDate` (UTC). */
export async function insertScheduledMedicine(
  db: JourneyDatabase,
  ownerId: string,
  {
    label,
    startDate,
    times,
    scheduleId = randomUUID(),
  }: { label: string; startDate: string; times: Slot[]; scheduleId?: string },
) {
  const medicineId = randomUUID()
  await db
    .prepare('INSERT INTO user_medications(owner_id,id,label,strength,unit) VALUES(?,?,?,?,?)')
    .bind(ownerId, medicineId, label, '10 mg', 'tablet')
    .run()
  await db
    .prepare(
      'INSERT INTO daily_schedules(owner_id,id,medicine_id,start_date,times,confirmed_at) VALUES(?,?,?,?,?,?)',
    )
    .bind(
      ownerId,
      scheduleId,
      medicineId,
      startDate,
      JSON.stringify(times),
      `${startDate}T00:00:00.000Z`,
    )
    .run()
  return { medicineId, scheduleId }
}

/** Record a Taken outcome for one scheduled dose. */
export async function insertTakenRecord(
  db: JourneyDatabase,
  ownerId: string,
  dose: { scheduleId: string; dueAt: string; takenAt: string; quantity: number },
) {
  await db
    .prepare(
      'INSERT INTO dose_records(owner_id,schedule_id,due_at,taken_at,quantity,outcome) VALUES(?,?,?,?,?,?)',
    )
    .bind(ownerId, dose.scheduleId, dose.dueAt, dose.takenAt, dose.quantity, 'Taken')
    .run()
}

/** Record a Skipped outcome for one scheduled dose. */
export async function insertSkippedRecord(
  db: JourneyDatabase,
  ownerId: string,
  dose: { scheduleId: string; dueAt: string; recordedAt: string },
) {
  await db
    .prepare(
      'INSERT INTO skipped_dose_records(owner_id,schedule_id,due_at,recorded_at,outcome) VALUES(?,?,?,?,?)',
    )
    .bind(ownerId, dose.scheduleId, dose.dueAt, dose.recordedAt, 'Skipped')
    .run()
}

/** Shift a YYYY-MM-DD date by whole days. */
export function addDays(date: string, days: number) {
  const value = new Date(`${date}T12:00:00.000Z`)
  value.setUTCDate(value.getUTCDate() + days)
  return value.toISOString().slice(0, 10)
}
