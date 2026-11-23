import {
  isMedicineType,
  isStockCount,
  isQuantityFor,
  isWritableMedicineType,
  type Access,
  type MedicineType,
  type WritableMedicineType,
} from '../../lib/quantity-policy'
import { isInstant } from '../schedules/contract'
import { ApplicationError } from '../../lib/application-error'

export type Medicine = Partial<MedicineMetadata> & {
  id: string
  label: string
  strength: string | null
  unit: MedicineType
}
export type StrengthRevision = {
  id: string
  strength: string | null
  effectiveAt: string
  label: string
  unit: MedicineType
  previousValues: { strength: string | null; label: string; unit: MedicineType }[]
}
type MedicineMetadata = {
  revision: number
  lastActionId: string | null
  currentStrengthRevisionId: string
  strengthRevisions: StrengthRevision[]
  everHadSchedule: boolean
  everHadDose: boolean
  latestTakenAt: string | null
  /** The archive's Edit time; null while active. Reads before #322 omit it (active). */
  archivedAt: string | null
  /** Count floors at zero. Absent threshold means alert off; only active, tracked low Stock has `low: true`. */
  stock: (
    { tracked: false } | { tracked: true; count: number; intakePastCount?: true; low?: true }
  ) & { threshold?: number }
}

export type MedicineRecord = Medicine & MedicineMetadata
/** A Medicine as saves send it: only writable Types. */
export type MedicineInput = Medicine & { unit: WritableMedicineType; startingCount?: number }

/** An Archived medicine: kept out of Medications and every view that offers it for new doses. */
export const isArchived = (medicine: Medicine) => Boolean(medicine.archivedAt)

export type MedicineResponses = {
  list: { medicines: Medicine[] }
  save: { medicines: Medicine[] }
  correctDetails: { medicines: MedicineRecord[] }
  changeStrength: { medicines: MedicineRecord[] }
  archive: { medicines: MedicineRecord[] }
  restore: { medicines: MedicineRecord[] }
  stockOn: { medicines: MedicineRecord[] }
  stockOff: { medicines: MedicineRecord[] }
  stockCorrection: { medicines: MedicineRecord[] }
  stockRefill: { medicines: MedicineRecord[] }
  stockThreshold: { medicines: MedicineRecord[] }
  delete: { deletion: MedicineDeleteReceipt }
}
export type MedicineCommand =
  | { operation: 'stockOn'; ownerId: string; stock: StockOn }
  | { operation: 'stockOff'; ownerId: string; stock: StockOff }
  | { operation: 'stockCorrection'; ownerId: string; stock: StockCorrection }
  | { operation: 'stockRefill'; ownerId: string; stock: StockRefill }
  | { operation: 'stockThreshold'; ownerId: string; stock: StockThreshold }
  | { operation: 'list'; ownerId: string }
  | { operation: 'save'; ownerId: string; medicine: MedicineInput }
  | { operation: 'correctDetails'; ownerId: string; correction: DetailCorrection }
  | { operation: 'changeStrength'; ownerId: string; change: StrengthChange }
  | { operation: 'archive'; ownerId: string; archive: MedicineArchive }
  | { operation: 'restore'; ownerId: string; restore: MedicineRestore }
  | { operation: 'delete'; ownerId: string; deletion: MedicineDelete }

export type MedicineResponse<C extends MedicineCommand = MedicineCommand> =
  MedicineResponses[C['operation']]

/** A save's Medicine: only writable Types (quantity policy). */
export function parseMedicine(value: unknown): MedicineInput {
  const medicine = parseMedicineDetails(value, 'write') as MedicineInput
  const input = value as Record<string, unknown>
  if (input.startingCount !== undefined) {
    if (!isStockCount(input.startingCount, medicine.unit))
      throw new ApplicationError('validation', 400)
    medicine.startingCount = input.startingCount
  }
  return medicine
}

/** A Name or Strength within the 120-character limit once trimmed, as Add medicine checks it. */
export function isMedicineText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length <= 120
}

function parseMedicineDetails(value: unknown, access: Access): Medicine {
  if (!value || typeof value !== 'object') throw new ApplicationError('validation', 400)
  const input = value as Record<string, unknown>
  if (
    typeof input.id !== 'string' ||
    !uuidPattern.test(input.id) ||
    !isMedicineText(input.label) ||
    !input.label.trim() ||
    (input.strength != null && !isMedicineText(input.strength)) ||
    !(access === 'write' ? isWritableMedicineType : isMedicineType)(input.unit)
  )
    throw new ApplicationError('validation', 400)
  return {
    id: input.id,
    label: input.label.trim(),
    strength: typeof input.strength === 'string' ? input.strength.trim() || null : null,
    unit: input.unit,
  }
}

// Input parsing ignores read metadata. Response parsing retains and validates it when present,
// allowing the old Worker during release overlap.
// Reads accept every readable Type, so a deployed app can show a Medicine a newer Worker saved.
export function parseMedicineRecord(value: unknown): MedicineRecord {
  const medicine = parseMedicineDetails(value, 'read')
  const input = value as Record<string, unknown>
  if (
    !Number.isSafeInteger(input.revision) ||
    (input.revision as number) < 0 ||
    (input.lastActionId !== null &&
      (typeof input.lastActionId !== 'string' || !uuidPattern.test(input.lastActionId))) ||
    typeof input.currentStrengthRevisionId !== 'string' ||
    !Array.isArray(input.strengthRevisions) ||
    !input.strengthRevisions.length ||
    typeof input.everHadSchedule !== 'boolean' ||
    typeof input.everHadDose !== 'boolean' ||
    (input.latestTakenAt !== null && !isInstant(input.latestTakenAt)) ||
    (input.archivedAt != null && !isInstant(input.archivedAt))
  )
    throw new ApplicationError('validation', 400)
  const strengthRevisions = input.strengthRevisions.map((value: unknown) => {
    const row = value as Record<string, unknown>
    if (
      !row ||
      typeof row.id !== 'string' ||
      !uuidPattern.test(row.id) ||
      !isInstant(row.effectiveAt)
    )
      throw new ApplicationError('validation', 400)
    const details = parseMedicineDetails({ ...row, id: row.id }, 'read')
    if (!Array.isArray(row.previousValues)) throw new ApplicationError('validation', 400)
    const previousValues = row.previousValues.map((value) => {
      const prior = parseMedicineDetails({ ...(value as object), id: row.id }, 'read')
      return { strength: prior.strength, label: prior.label, unit: prior.unit }
    })
    return {
      id: row.id,
      strength: parseStrength(row.strength),
      effectiveAt: row.effectiveAt,
      label: details.label,
      unit: details.unit,
      previousValues,
    }
  })
  if (!strengthRevisions.some((r) => r.id === input.currentStrengthRevisionId))
    throw new ApplicationError('validation', 400)
  return {
    ...medicine,
    stock: parseStock(input.stock, medicine.unit),
    revision: input.revision as number,
    lastActionId: input.lastActionId as string | null,
    currentStrengthRevisionId: input.currentStrengthRevisionId,
    strengthRevisions,
    everHadSchedule: input.everHadSchedule,
    everHadDose: input.everHadDose,
    latestTakenAt: input.latestTakenAt as string | null,
    archivedAt: (input.archivedAt as string | null | undefined) ?? null,
  }
}

export function parseMedicineResponse(value: unknown): Medicine | MedicineRecord {
  return value && typeof value === 'object' && 'revision' in value
    ? parseMedicineRecord(value)
    : parseMedicineDetails(value, 'read')
}

export const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
function parseStrength(value: unknown): string | null {
  if (value !== null && (typeof value !== 'string' || !value.trim() || value.length > 120))
    throw new ApplicationError('validation', 400)
  return value as string | null
}

export type DetailCorrection = {
  actionId: string
  medicineId: string
  expectedRevision: number
  strengthRevisionId: string
  label: string
  strength: string | null
  unit: WritableMedicineType
}
export type StrengthChange = {
  actionId: string
  medicineId: string
  expectedRevision: number
  strength: string | null
  effectiveAt: string
  timeZone: 'Europe/Istanbul'
}

export function parseEditKey(value: unknown) {
  if (!value || typeof value !== 'object') throw new ApplicationError('validation', 400)
  const input = value as Record<string, unknown>
  if (
    typeof input.actionId !== 'string' ||
    !uuidPattern.test(input.actionId) ||
    typeof input.medicineId !== 'string' ||
    !uuidPattern.test(input.medicineId) ||
    !Number.isSafeInteger(input.expectedRevision) ||
    (input.expectedRevision as number) < 0
  )
    throw new ApplicationError('validation', 400)
  return {
    actionId: input.actionId.toLowerCase(),
    medicineId: input.medicineId.toLowerCase(),
    expectedRevision: input.expectedRevision as number,
  }
}
export function parseDetailCorrection(value: unknown): DetailCorrection {
  const key = parseEditKey(value)
  const input = value as Record<string, unknown>
  if (typeof input.strengthRevisionId !== 'string' || !uuidPattern.test(input.strengthRevisionId))
    throw new ApplicationError('validation', 400)
  const medicine = parseMedicine({ ...input, id: key.medicineId })
  return {
    ...key,
    strengthRevisionId: input.strengthRevisionId.toLowerCase(),
    label: medicine.label,
    strength: medicine.strength,
    unit: medicine.unit,
  }
}
export function parseStrengthChange(value: unknown): StrengthChange {
  const key = parseEditKey(value)
  const input = value as Record<string, unknown>
  if (!isInstant(input.effectiveAt) || input.timeZone !== 'Europe/Istanbul')
    throw new ApplicationError('validation', 400)
  return {
    ...key,
    strength: parseStrength(input.strength),
    effectiveAt: input.effectiveAt,
    timeZone: 'Europe/Istanbul',
  }
}

/** Archive at the server-confirmed Edit time; the revision guards stale state. */
export type MedicineArchive = { actionId: string; medicineId: string; expectedRevision: number }
export function parseMedicineArchive(value: unknown): MedicineArchive {
  return parseEditKey(value)
}

/** Restore the record only; schedules stay stopped until an explicit schedule change. */
export type MedicineRestore = { actionId: string; medicineId: string; expectedRevision: number }
export function parseMedicineRestore(value: unknown): MedicineRestore {
  return parseEditKey(value)
}

/** Permanent deletion is only available before any schedule or dose use. */
export type MedicineDelete = { actionId: string; medicineId: string; expectedRevision: number }
export type MedicineDeleteReceipt = MedicineDelete & { deletedAt: string }
export function parseMedicineDelete(value: unknown): MedicineDelete {
  return parseEditKey(value)
}
export function parseMedicineDeleteReceipt(value: unknown): MedicineDeleteReceipt {
  const key = parseEditKey(value)
  const input = value as Record<string, unknown>
  if (!isInstant(input.deletedAt)) throw new ApplicationError('validation', 400)
  return { ...key, deletedAt: input.deletedAt }
}

export type StockOn = MedicineArchive & { unit: WritableMedicineType; startingCount: number }
export type StockOff = MedicineArchive
export type StockCorrection = MedicineArchive & { unit: WritableMedicineType; count: number }
export type StockRefill = MedicineArchive & { unit: WritableMedicineType; amount: number }
export type StockThreshold = MedicineArchive & {
  unit: WritableMedicineType
  threshold: number | null
}
export function parseStockThreshold(value: unknown): StockThreshold {
  const key = parseEditKey(value)
  const input = value as Record<string, unknown>
  if (
    !isWritableMedicineType(input.unit) ||
    (input.threshold !== null && !isQuantityFor(input.threshold, input.unit))
  )
    throw new ApplicationError('validation', 400)
  return { ...key, unit: input.unit, threshold: input.threshold as number | null }
}
export function parseStockRefill(value: unknown): StockRefill {
  const key = parseEditKey(value)
  const input = value as Record<string, unknown>
  if (!isWritableMedicineType(input.unit) || !isQuantityFor(input.amount, input.unit))
    throw new ApplicationError('validation', 400)
  return { ...key, unit: input.unit, amount: input.amount }
}
export function parseStockCorrection(value: unknown): StockCorrection {
  const key = parseEditKey(value)
  const input = value as Record<string, unknown>
  if (!isWritableMedicineType(input.unit) || !isStockCount(input.count, input.unit))
    throw new ApplicationError('validation', 400)
  return { ...key, unit: input.unit, count: input.count }
}
export function parseStockOn(value: unknown): StockOn {
  const key = parseEditKey(value)
  const input = value as Record<string, unknown>
  if (!isWritableMedicineType(input.unit) || !isStockCount(input.startingCount, input.unit))
    throw new ApplicationError('validation', 400)
  return { ...key, unit: input.unit, startingCount: input.startingCount }
}
export const parseStockOff = parseMedicineArchive

function parseStock(value: unknown, unit: MedicineType): MedicineRecord['stock'] {
  // Older Worker reads and immutable pre-stock receipts omit stock.
  if (value === undefined) return { tracked: false }
  if (!value || typeof value !== 'object') throw new ApplicationError('validation', 400)
  const stock = value as Record<string, unknown>
  if (stock.threshold !== undefined && !isQuantityFor(stock.threshold, unit))
    throw new ApplicationError('validation', 400)
  const threshold = stock.threshold === undefined ? {} : { threshold: stock.threshold as number }
  if (stock.tracked === false) return { tracked: false, ...threshold }
  if (stock.tracked === true && isStockCount(stock.count, unit))
    return {
      tracked: true,
      count: stock.count,
      ...threshold,
      ...(stock.intakePastCount === true ? { intakePastCount: true as const } : {}),
      ...(stock.low === true ? { low: true as const } : {}),
    }
  throw new ApplicationError('validation', 400)
}
