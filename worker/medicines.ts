// Strength edits are one insert plus database triggers (0013): validation, period and
// snapshot changes, revision increment and exact receipt commit or roll back together.
// Triggers serialize usage locks and latest-Taken checks against concurrent dose writes,
// including writes from an older Worker. Retry lookup precedes clock/revision validation.
import { and, eq, sql } from 'drizzle-orm'
import type { DrizzleD1Database } from 'drizzle-orm/d1'
import {
  parseMedicineRecord,
  parseMedicineDeleteReceipt,
  type MedicineDelete,
  type StockOn,
  type StockCorrection,
  type StockRefill,
  type StockOff,
  type MedicineInput,
  type MedicineRecord,
  type DetailCorrection,
  type StrengthChange,
  type MedicineArchive,
  type MedicineRestore,
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

export async function saveMedicine(
  db: DrizzleD1Database,
  ownerId: string,
  medicine: MedicineInput,
  now: Date,
) {
  if (medicine.startingCount === undefined) {
    // Stock-off creation retains its original insertion contract.
    await db.run(sql`INSERT INTO user_medications(owner_id,id,label,strength,unit)
      VALUES(${ownerId},${medicine.id},${medicine.label},${medicine.strength},${medicine.unit})
      ON CONFLICT(owner_id,id) DO NOTHING`)
  } else {
    await db.run(sql`INSERT INTO user_medications(owner_id,id,label,strength,unit,starting_count,stock_started_at)
      VALUES(${ownerId},${medicine.id},${medicine.label},${medicine.strength},${medicine.unit},${medicine.startingCount},${now.toISOString()})
      ON CONFLICT(owner_id,id) DO NOTHING`)
  }
  const row = await db
    .select({ request: userMedications.creationRequest, result: userMedications.creationResult })
    .from(userMedications)
    .where(and(eq(userMedications.ownerId, ownerId), eq(userMedications.id, medicine.id)))
    .get()
  const original = row?.request ? (JSON.parse(row.request) as MedicineInput) : null
  if (
    !original ||
    original.label !== medicine.label ||
    original.strength !== medicine.strength ||
    original.unit !== medicine.unit ||
    original.startingCount !== medicine.startingCount
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
    .select({ label: userMedications.label, unit: userMedications.unit })
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

// Restore (#323) uses one receipt insert (0015): archived_at, revision and receipt
// change atomically. No schedule or reminder is created or replayed. Replay precedes
// state validation, retaining the exact receipt even after another archive or edit.
export async function restoreMedicine(
  db: DrizzleD1Database,
  ownerId: string,
  input: MedicineRestore,
  now: Date,
) {
  const request = JSON.stringify(input)
  const replay = async () => {
    const row = await db.get<{ request: string; result: string | null }>(
      sql`SELECT request,result FROM medicine_restores WHERE owner_id=${ownerId} AND action_id=${input.actionId}`,
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
  if (!owned) throw new ApplicationError('conflict', 409)
  await db.run(sql`INSERT INTO medicine_restores
    (owner_id,action_id,medicine_id,expected_revision,confirmed_at,request)
    VALUES(${ownerId},${input.actionId},${input.medicineId},${input.expectedRevision},${now.toISOString()},${request})
    ON CONFLICT DO NOTHING`)
  const saved = await replay()
  if (!saved) throw new ApplicationError('conflict', 409)
  return saved
}

// One receipt insert (0016) serializes eligibility with first-use writes, deletes
// the record and its dependent data, and blocks creation replay even on older Workers.
// Replay precedes record lookup: the receipt survives the Medicine it removed.
export async function deleteMedicine(
  db: DrizzleD1Database,
  ownerId: string,
  input: MedicineDelete,
  now: Date,
) {
  const request = JSON.stringify(input)
  const replay = async () => {
    const row = await db.get<{ request: string; result: string | null }>(
      sql`SELECT request,result FROM medicine_deletions WHERE owner_id=${ownerId} AND action_id=${input.actionId}`,
    )
    if (!row) return null
    if (row.request !== request) throw new ApplicationError('conflict', 409)
    return { deletion: parseMedicineDeleteReceipt(JSON.parse(row.result!)) }
  }
  const prior = await replay()
  if (prior) return prior
  await db.run(sql`INSERT INTO medicine_deletions
    (owner_id,action_id,medicine_id,expected_revision,deleted_at,request)
    VALUES(${ownerId},${input.actionId},${input.medicineId},${input.expectedRevision},${now.toISOString()},${request})
    ON CONFLICT DO NOTHING`)
  const saved = await replay()
  if (!saved) throw new ApplicationError('conflict', 409)
  return saved
}

// One action insert validates revision/state/unit, records a reconciliation
// or refill movement, updates the count and saves the exact receipt atomically. Replay comes first.
export async function setMedicineStock(
  db: DrizzleD1Database,
  ownerId: string,
  kind: 'stockOn' | 'stockOff' | 'stockCorrection' | 'stockRefill',
  input: StockOn | StockOff | StockCorrection | StockRefill,
  now: Date,
) {
  const request = JSON.stringify({ kind, ...input })
  const replay = async () => {
    const row = await db.get<{ request: string; result: string }>(
      sql`SELECT request,result FROM medicine_stock_actions WHERE owner_id=${ownerId} AND action_id=${input.actionId}`,
    )
    if (!row) return null
    if (row.request !== request) throw new ApplicationError('conflict', 409)
    return { medicines: [parseMedicineRecord(JSON.parse(row.result))] }
  }
  const prior = await replay()
  if (prior) return prior
  const owned = await db.get(
    sql`SELECT id FROM user_medications WHERE owner_id=${ownerId} AND id=${input.medicineId}`,
  )
  if (!owned) throw new ApplicationError('not_found', 404)
  const count =
    'amount' in input
      ? input.amount
      : 'count' in input
        ? input.count
        : 'startingCount' in input
          ? input.startingCount
          : null
  await db.run(sql`INSERT INTO medicine_stock_actions
    (owner_id,action_id,medicine_id,expected_revision,kind,count,unit,confirmed_at,request)
    VALUES(${ownerId},${input.actionId},${input.medicineId},${input.expectedRevision},${kind},${count},${'unit' in input ? input.unit : null},${now.toISOString()},${request}) ON CONFLICT DO NOTHING`)
  const saved = await replay()
  if (!saved) throw new ApplicationError('conflict', 409)
  return saved
}
