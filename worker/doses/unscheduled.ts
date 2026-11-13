// Unscheduled doses never create Occurrences. Immutable revisions retain exact action
// retries before clock validation. Unique owner/action and dose/revision constraints
// arbitrate concurrent saves; changes use an atomic compare-and-append.
import { and, desc, eq, sql } from 'drizzle-orm'
import type { DrizzleD1Database } from 'drizzle-orm/d1'
import type {
  UnscheduledDose,
  UnscheduledDoseInput,
  UnscheduledDoseChange,
} from '../../src/features/unscheduled-doses/contract'
import { istanbulDate, shiftDate } from '../../src/lib/calendar-date'
import { isQuantityForUnit } from '../../src/lib/dose-quantity'
import { ApplicationError } from '../../src/lib/application-error'
import { unscheduledDoses, userMedications } from '../schema'
import { scheduledInstant } from '../../src/features/schedules/occurrences'

type Row = typeof unscheduledDoses.$inferSelect
function record(row: Row): UnscheduledDose {
  return {
    id: row.id,
    actionId: row.actionId,
    medicineId: row.medicineId,
    takenAt: row.takenAt,
    quantity: row.quantity,
    revision: row.revision,
    removed: row.removed,
    outcome: 'Taken',
  }
}

export async function listUnscheduledDoses(db: DrizzleD1Database, ownerId: string, date: string) {
  const rows = await db
    .select()
    .from(unscheduledDoses)
    .where(
      and(
        eq(unscheduledDoses.ownerId, ownerId),
        eq(unscheduledDoses.removed, false),
        sql`${unscheduledDoses.takenAt} >= ${scheduledInstant(date, '00:00')}`,
        sql`${unscheduledDoses.takenAt} < ${scheduledInstant(shiftDate(date, 1), '00:00')}`,
        sql`NOT EXISTS (SELECT 1 FROM unscheduled_doses latest WHERE latest.owner_id = ${unscheduledDoses.ownerId} AND latest.id = ${unscheduledDoses.id} AND latest.revision > ${unscheduledDoses.revision})`,
      ),
    )
    .orderBy(unscheduledDoses.takenAt, unscheduledDoses.id)
  return rows.map(record)
}

export async function writeUnscheduledDose(
  db: DrizzleD1Database,
  ownerId: string,
  input: UnscheduledDoseInput | UnscheduledDoseChange,
  now: Date,
): Promise<UnscheduledDose> {
  const request = JSON.stringify(input)
  const replay = async () => {
    const row = await db
      .select()
      .from(unscheduledDoses)
      .where(
        and(eq(unscheduledDoses.ownerId, ownerId), eq(unscheduledDoses.actionId, input.actionId)),
      )
      .get()
    if (!row) return null
    if (row.request !== request) throw new ApplicationError('conflict', 409)
    return record(row)
  }
  const prior = await replay()
  if (prior) return prior
  const change = 'doseId' in input ? input : null
  const latest = change
    ? await db
        .select()
        .from(unscheduledDoses)
        .where(and(eq(unscheduledDoses.ownerId, ownerId), eq(unscheduledDoses.id, change.doseId)))
        .orderBy(desc(unscheduledDoses.revision))
        .get()
    : undefined
  if (change && !latest) throw new ApplicationError('validation', 400)
  if (change && (latest!.removed || latest!.revision !== change.expectedRevision)) {
    const saved = await replay()
    if (saved) return saved
    throw new ApplicationError('conflict', 409)
  }
  const medicineId = 'medicineId' in input ? input.medicineId : latest!.medicineId
  const medicine = await db
    .select()
    .from(userMedications)
    .where(and(eq(userMedications.ownerId, ownerId), eq(userMedications.id, medicineId)))
    .get()
  const removed = change?.removed ?? false
  const takenAt = 'takenAt' in input ? input.takenAt : latest!.takenAt
  const quantity = 'quantity' in input ? input.quantity : latest!.quantity
  const today = istanbulDate(now)
  const date = istanbulDate(new Date(takenAt))
  if (
    !medicine ||
    (!removed &&
      (Date.parse(takenAt) > now.getTime() ||
        date < shiftDate(today, -1) ||
        date > today ||
        !isQuantityForUnit(quantity, medicine.unit)))
  )
    throw new ApplicationError('validation', 400)
  const id = change ? change.doseId : input.actionId
  const revision = change ? change.expectedRevision + 1 : 0
  try {
    // SELECT's predicate and unique revision key both run in the insertion statement.
    await db.run(sql`INSERT INTO unscheduled_doses (owner_id,id,revision,action_id,medicine_id,taken_at,quantity,removed,request)
      SELECT ${ownerId},${id},${revision},${input.actionId},${medicineId},${takenAt},${quantity},${removed ? 1 : 0},${request}
      WHERE ${change ? sql`EXISTS (SELECT 1 FROM unscheduled_doses WHERE owner_id = ${ownerId} AND id = ${id} AND revision = ${change.expectedRevision} AND removed = 0) AND NOT EXISTS (SELECT 1 FROM unscheduled_doses WHERE owner_id = ${ownerId} AND id = ${id} AND revision > ${change.expectedRevision})` : sql`1`}`)
  } catch (error) {
    const saved = await replay()
    if (saved) return saved
    if (change) {
      const current = await db
        .select()
        .from(unscheduledDoses)
        .where(and(eq(unscheduledDoses.ownerId, ownerId), eq(unscheduledDoses.id, id)))
        .orderBy(desc(unscheduledDoses.revision))
        .get()
      if (current && current.revision !== change.expectedRevision)
        throw new ApplicationError('conflict', 409)
    }
    throw error
  }
  const saved = await replay()
  if (!saved) throw new ApplicationError('conflict', 409)
  return saved
}
