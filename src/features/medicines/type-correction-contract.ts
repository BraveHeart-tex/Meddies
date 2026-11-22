import {
  isDoseQuantity,
  isMedicineType,
  isQuantityFor,
  isStockCount,
  isWritableMedicineType,
  type MedicineType,
  type WritableMedicineType,
} from '../../lib/quantity-policy'
import { ApplicationError } from '../../lib/application-error'
import { isInstant, isScheduleDate } from '../schedules/contract'
import { uuidPattern, parseEditKey, parseDetailCorrection, type DetailCorrection } from './contract'

export const typeCorrectionBodyLimit = 128 * 1024

export type TypeCorrectionReviewInput = { medicineId: string; unit: WritableMedicineType }
type QuantityConflict = { key: string; quantity: number; time: string } & (
  | { kind: 'scheduled' | 'unscheduled' }
  | {
      kind: 'schedule'
      version: { id: string; startDate: string; confirmedAt: string; replacedAt: string | null }
    }
)
export type TypeCorrectionReview = TypeCorrectionReviewInput & {
  fromUnit: MedicineType
  revision: number
  reviewVersion: number
  stockTracked: boolean
  compatibleAmounts: number
  conflicts: QuantityConflict[]
}
export type TypeCorrection = ReturnType<typeof parseEditKey> &
  TypeCorrectionReviewInput & {
    reviewVersion: number
    repairs: { key: string; quantity: number }[]
    stockCount: number | null
    details?: Pick<DetailCorrection, 'strengthRevisionId' | 'label' | 'strength'>
  }
export type TypeCorrectionCommand =
  | { operation: 'reviewTypeCorrection'; ownerId: string; review: TypeCorrectionReviewInput }
  | { operation: 'correctType'; ownerId: string; correction: TypeCorrection }

export function parseTypeCorrectionReviewInput(value: unknown): TypeCorrectionReviewInput {
  const input = value as Record<string, unknown> | null
  if (
    typeof input?.medicineId !== 'string' ||
    !uuidPattern.test(input.medicineId) ||
    !isWritableMedicineType(input.unit)
  )
    throw new ApplicationError('validation', 400)
  return { medicineId: input.medicineId.toLowerCase(), unit: input.unit }
}

function isReviewVersion(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

export function parseTypeCorrection(value: unknown): TypeCorrection {
  const key = parseEditKey(value)
  const { unit } = parseTypeCorrectionReviewInput(value)
  const input = value as Record<string, unknown>
  if (
    !isReviewVersion(input.reviewVersion) ||
    !Array.isArray(input.repairs) ||
    (input.stockCount !== null && !isStockCount(input.stockCount, unit))
  )
    throw new ApplicationError('validation', 400)
  const repairs = input.repairs.map((repair: unknown) => {
    const row = repair as Record<string, unknown> | null
    if (typeof row?.key !== 'string' || !isQuantityFor(row.quantity, unit))
      throw new ApplicationError('validation', 400)
    return { key: row.key, quantity: row.quantity }
  })
  let details: TypeCorrection['details']
  if (input.details !== undefined) {
    const { strengthRevisionId, label, strength } = parseDetailCorrection({
      ...(input.details as object),
      ...key,
      unit,
    })
    details = { strengthRevisionId, label, strength }
  }
  return {
    ...key,
    unit,
    reviewVersion: input.reviewVersion,
    repairs,
    stockCount: input.stockCount as number | null,
    ...(details && { details }),
  }
}

export function parseTypeCorrectionReview(value: unknown): TypeCorrectionReview {
  const key = parseTypeCorrectionReviewInput(value)
  const review = value as Record<string, unknown>
  if (
    !isMedicineType(review.fromUnit) ||
    !isReviewVersion(review.revision) ||
    !isReviewVersion(review.reviewVersion) ||
    !isReviewVersion(review.compatibleAmounts) ||
    typeof review.stockTracked !== 'boolean' ||
    !Array.isArray(review.conflicts)
  )
    throw new ApplicationError('validation', 400)
  const conflicts = review.conflicts.map((conflict: unknown): QuantityConflict => {
    const row = conflict as Record<string, unknown> | null
    if (
      typeof row?.key !== 'string' ||
      !isDoseQuantity(row.quantity, 'read') ||
      typeof row.time !== 'string'
    )
      throw new ApplicationError('validation', 400)
    const amount = { key: row.key, quantity: row.quantity, time: row.time }
    if ((row.kind === 'scheduled' || row.kind === 'unscheduled') && isInstant(row.time))
      return { ...amount, kind: row.kind }
    const version = row.version as Record<string, unknown> | null
    if (
      row.kind !== 'schedule' ||
      !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(row.time) ||
      typeof version?.id !== 'string' ||
      !uuidPattern.test(version.id) ||
      !isScheduleDate(version.startDate) ||
      !isInstant(version.confirmedAt) ||
      (version.replacedAt !== null && !isInstant(version.replacedAt))
    )
      throw new ApplicationError('validation', 400)
    const { id, startDate, confirmedAt, replacedAt } = version
    return { ...amount, kind: row.kind, version: { id, startDate, confirmedAt, replacedAt } }
  })
  return {
    ...key,
    fromUnit: review.fromUnit,
    revision: review.revision,
    reviewVersion: review.reviewVersion,
    compatibleAmounts: review.compatibleAmounts,
    stockTracked: review.stockTracked,
    conflicts,
  }
}
