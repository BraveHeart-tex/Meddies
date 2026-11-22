// A Type Detail correction reviews one storage snapshot. The D1 insert compares both
// revisions and saves the effective amounts, reconciliation and receipt in one statement.
// An identical action replays before any current-state or repair checks.
import { sql } from 'drizzle-orm'
import type { DrizzleD1Database } from 'drizzle-orm/d1'
import {
  type TypeCorrection,
  type TypeCorrectionReview,
  type TypeCorrectionReviewInput,
} from '../src/features/medicines/type-correction-contract'
import { parseMedicineRecord } from '../src/features/medicines/contract'
import { ApplicationError } from '../src/lib/application-error'
import { isQuantityFor, quantityBounds, type MedicineType } from '../src/lib/quantity-policy'
import { parseStoredResult } from './medicines'

type Conflict = TypeCorrectionReview['conflicts'][number]
type Amount = Conflict & { id: string; revision: number }
type ReviewRow = {
  unit: MedicineType
  revision: number
  reviewVersion: number
  stockTracked: number
  archivedAt: string | null
  strengthRevisionExists: number
} & (
  | { kind: null }
  | ({
      id: string
      amountRevision: number
      key: string
      quantity: number
      time: string
    } & (
      | { kind: 'scheduled' | 'unscheduled' }
      | { kind: 'schedule'; startDate: string; confirmedAt: string; replacedAt: string | null }
    ))
)

async function reviewSnapshot(
  db: DrizzleD1Database,
  ownerId: string,
  input: TypeCorrectionReviewInput,
  strengthRevisionId: string | null = null,
) {
  const rows = await db.all<ReviewRow>(sql`
    SELECT m.unit,m.revision,m.archived_at AS archivedAt,m.quantity_review_revision AS reviewVersion,
      m.stock_count IS NOT NULL AS stockTracked,
      EXISTS(SELECT 1 FROM medicine_strength_revisions r WHERE r.owner_id=m.owner_id
        AND r.medicine_id=m.id AND r.id=${strengthRevisionId}) AS strengthRevisionExists,
      a.kind,a.id,a.revision AS amountRevision,a.key,a.quantity,a.time,
      s.start_date AS startDate,s.confirmed_at AS confirmedAt,successor.confirmed_at AS replacedAt
    FROM user_medications m LEFT JOIN (
      SELECT * FROM medicine_quantity_amounts WHERE owner_id=${ownerId} AND medicine_id=${input.medicineId}
    ) a ON a.owner_id=m.owner_id AND a.medicine_id=m.id
    LEFT JOIN daily_schedules s ON a.kind='schedule' AND s.owner_id=m.owner_id AND s.id=a.id
    LEFT JOIN daily_schedules successor ON successor.owner_id=s.owner_id AND successor.based_on_id=s.id
    WHERE m.owner_id=${ownerId} AND m.id=${input.medicineId}
    ORDER BY a.kind='schedule',s.confirmed_at DESC,a.time DESC,a.key
  `)
  const medicine = rows[0]
  if (!medicine) throw new ApplicationError('validation', 400)
  const conflicts: Amount[] = []
  let compatibleAmounts = 0
  const fits = (quantity: number): boolean => isQuantityFor(quantity, input.unit)
  for (const row of rows) {
    if (row.kind === null) continue
    if (fits(row.quantity)) {
      compatibleAmounts++
    } else {
      const { id, amountRevision: revision, key, quantity, time } = row
      const amount = { id, revision, key, quantity, time }
      conflicts.push(
        row.kind === 'schedule'
          ? {
              ...amount,
              kind: row.kind,
              version: {
                id,
                startDate: row.startDate,
                confirmedAt: row.confirmedAt,
                replacedAt: row.replacedAt,
              },
            }
          : { ...amount, kind: row.kind },
      )
    }
  }
  return { medicine, compatibleAmounts, conflicts }
}

export async function reviewMedicineType(
  db: DrizzleD1Database,
  ownerId: string,
  input: TypeCorrectionReviewInput,
): Promise<TypeCorrectionReview> {
  const { medicine, compatibleAmounts, conflicts } = await reviewSnapshot(db, ownerId, input)
  if (medicine.archivedAt !== null || medicine.unit === input.unit)
    throw new ApplicationError('validation', 400)
  return {
    ...input,
    fromUnit: medicine.unit,
    revision: medicine.revision,
    reviewVersion: medicine.reviewVersion,
    stockTracked: Boolean(medicine.stockTracked),
    compatibleAmounts,
    conflicts: conflicts.map(({ id: _id, revision: _revision, ...conflict }) => conflict),
  }
}

export async function correctMedicineType(
  db: DrizzleD1Database,
  ownerId: string,
  input: TypeCorrection,
  now: Date,
) {
  const request = JSON.stringify(input)
  const replay = async () => {
    const prior = await db.get<{ request: string; result: string }>(sql`
      SELECT request,result FROM medicine_type_corrections WHERE owner_id=${ownerId} AND action_id=${input.actionId}
    `)
    if (!prior) return null
    if (prior.request !== request) throw new ApplicationError('conflict', 409)
    return { medicines: [parseStoredResult(prior.result, parseMedicineRecord)] }
  }
  const prior = await replay()
  if (prior) return prior
  const details = input.details
  const { medicine, conflicts } = await reviewSnapshot(
    db,
    ownerId,
    input,
    details?.strengthRevisionId,
  )
  if (
    medicine.revision !== input.expectedRevision ||
    medicine.reviewVersion !== input.reviewVersion
  ) {
    const saved = await replay()
    if (saved) return saved
    throw new ApplicationError('conflict', 409)
  }
  if (
    medicine.archivedAt !== null ||
    medicine.unit === input.unit ||
    Boolean(medicine.stockTracked) !== (input.stockCount !== null) ||
    (details && !medicine.strengthRevisionExists)
  )
    throw new ApplicationError('validation', 400)

  const repairs = new Map(input.repairs.map(({ key, quantity }) => [key, quantity]))
  if (repairs.size !== conflicts.length || repairs.size !== input.repairs.length)
    throw new ApplicationError('validation', 400)
  const audit = conflicts.map(({ key, quantity: before, kind, id, revision }) => {
    const quantity = repairs.get(key)
    if (quantity === undefined) throw new ApplicationError('validation', 400)
    return { kind, id, revision, key, before, quantity }
  })
  const { scale, max } = quantityBounds(input.unit)
  await db.run(sql`
    INSERT INTO medicine_type_corrections(
      owner_id,action_id,medicine_id,expected_revision,review_revision,from_unit,unit,
      quantity_scale,quantity_max,confirmed_at,count,request,repairs,strength_revision_id,label,strength
    ) VALUES(
      ${ownerId},${input.actionId},${input.medicineId},${input.expectedRevision},${input.reviewVersion},
      ${medicine.unit},${input.unit},${scale},${max},${now.toISOString()},${input.stockCount},
      ${request},${JSON.stringify(audit)},${details?.strengthRevisionId ?? null},
      ${details?.label ?? null},${details?.strength ?? null}
    ) ON CONFLICT DO NOTHING
  `)
  const saved = await replay()
  if (!saved) throw new ApplicationError('conflict', 409)
  return saved
}
