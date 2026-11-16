// Strength edits are one insert plus database triggers (0013): validation, period and
// snapshot changes, revision increment and exact receipt commit or roll back together.
// Triggers serialize usage locks and latest-Taken checks against concurrent dose writes,
// including writes from an older Worker. Retry lookup precedes clock/revision validation.
import { and, eq, sql } from 'drizzle-orm'
import type { DrizzleD1Database } from 'drizzle-orm/d1'
import {
  parseMedicineRecord,
  type Medicine,
  type MedicineRecord,
  type DetailCorrection,
  type StrengthChange,
  type MedicineArchive,
} from '../src/features/medicines/contract'
import { ApplicationError } from '../src/lib/application-error'
import { medicineEdits, userMedications } from './schema'

export async function listMedicines(
  db: DrizzleD1Database,
  ownerId: string,
): Promise<{ medicines: MedicineRecord[] }> {
  const rows = await db.all<{ record: string }>(
    sql`SELECT record FROM medicine_records WHERE owner_id=${ownerId} ORDER BY label,id`,
  )
  return { medicines: rows.map((row) => parseMedicineRecord(JSON.parse(row.record))) }
}

export async function saveMedicine(db: DrizzleD1Database, ownerId: string, medicine: Medicine) {
  await db
    .insert(userMedications)
    .values({ ...medicine, ownerId })
    .onConflictDoNothing({ target: [userMedications.ownerId, userMedications.id] })
  const row = await db
    .select({ request: userMedications.creationRequest, result: userMedications.creationResult })
    .from(userMedications)
    .where(and(eq(userMedications.ownerId, ownerId), eq(userMedications.id, medicine.id)))
    .get()
  const original = row?.request ? (JSON.parse(row.request) as Medicine) : null
  if (
    !original ||
    original.label !== medicine.label ||
    original.strength !== medicine.strength ||
    original.unit !== medicine.unit
  )
    throw new ApplicationError('conflict', 409)
  return { medicines: [parseMedicineRecord(JSON.parse(row!.result!))] }
}

export async function editMedicine(
  db: DrizzleD1Database,
  ownerId: string,
  input: DetailCorrection | StrengthChange,
  now: Date,
) {
  const kind = 'effectiveAt' in input ? 'changeStrength' : 'correctDetails'
  const request = JSON.stringify({ kind, ...input })
  const replay = async () => {
    const row = await db
      .select()
      .from(medicineEdits)
      .where(and(eq(medicineEdits.ownerId, ownerId), eq(medicineEdits.actionId, input.actionId)))
      .get()
    if (!row) return null
    if (row.request !== request) throw new ApplicationError('conflict', 409)
    return { medicines: [parseMedicineRecord(JSON.parse(row.result!))] }
  }
  const prior = await replay()
  if (prior) return prior
  const row = await db
    .select()
    .from(userMedications)
    .where(and(eq(userMedications.ownerId, ownerId), eq(userMedications.id, input.medicineId)))
    .get()
  if (!row) throw new ApplicationError('validation', 400)
  try {
    await db
      .insert(medicineEdits)
      .values({
        ownerId,
        actionId: input.actionId,
        medicineId: input.medicineId,
        expectedRevision: input.expectedRevision,
        kind,
        request,
        confirmedAt: now.toISOString(),
        strengthRevisionId:
          'strengthRevisionId' in input ? input.strengthRevisionId : input.actionId,
        strength: input.strength,
        label: 'label' in input ? input.label : row.label,
        unit: 'unit' in input ? input.unit : row.unit,
        effectiveAt: 'effectiveAt' in input ? input.effectiveAt : null,
      })
      .onConflictDoNothing({ target: [medicineEdits.ownerId, medicineEdits.actionId] })
  } catch (error) {
    const saved = await replay()
    if (saved) return saved
    if (
      /medicine_strength_identity/.test(
        String(error instanceof Error ? (error.cause ?? error) : error),
      )
    )
      throw new ApplicationError('conflict', 409)
    if (
      /medicine_(unit_locked|strength_time|revision_missing)/.test(
        String(error instanceof Error ? (error.cause ?? error) : error),
      )
    )
      throw new ApplicationError('validation', 400)
    throw error
  }
  const saved = await replay()
  if (!saved) throw new ApplicationError('conflict', 409)
  return saved
}

// Archive (#322) is one insert plus triggers (0014): the schedule stop at the Edit time,
// archived_at, the revision increment and the receipt commit or roll back together, and
// a schedule write racing it either becomes the version it stops or is refused.
// Replay by action precedes the revision check, so an identical retry returns the receipt.
export async function archiveMedicine(
  db: DrizzleD1Database,
  ownerId: string,
  input: MedicineArchive,
  now: Date,
) {
  const request = JSON.stringify(input)
  const replay = async () => {
    const row = await db.get<{ request: string; result: string | null }>(
      sql`SELECT request,result FROM medicine_archives WHERE owner_id=${ownerId} AND action_id=${input.actionId}`,
    )
    if (!row) return null
    if (row.request !== request) throw new ApplicationError('conflict', 409)
    return { medicines: [parseMedicineRecord(JSON.parse(row.result!))] }
  }
  const prior = await replay()
  if (prior) return prior
  const owned = await db
    .select({ id: userMedications.id })
    .from(userMedications)
    .where(and(eq(userMedications.ownerId, ownerId), eq(userMedications.id, input.medicineId)))
    .get()
  if (!owned) throw new ApplicationError('validation', 400)
  await db.run(sql`INSERT INTO medicine_archives
    (owner_id,action_id,medicine_id,expected_revision,confirmed_at,request)
    VALUES(${ownerId},${input.actionId},${input.medicineId},${input.expectedRevision},${now.toISOString()},${request})
    ON CONFLICT DO NOTHING`)
  const saved = await replay()
  if (!saved) throw new ApplicationError('conflict', 409)
  return saved
}
