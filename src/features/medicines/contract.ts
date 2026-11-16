import { isDoseUnit, type DoseUnit } from '../../lib/dose-quantity'
import { isInstant } from '../schedules/contract'
import { ApplicationError } from '../../lib/application-error'

export type Medicine = Partial<MedicineMetadata> & {
  id: string
  label: string
  strength: string | null
  unit: DoseUnit
}
export type StrengthRevision = {
  id: string
  strength: string | null
  effectiveAt: string
  label: string
  unit: DoseUnit
  previousValues: { strength: string | null; label: string; unit: DoseUnit }[]
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
}

export type MedicineRecord = Medicine & MedicineMetadata

export type MedicineResponses = {
  list: { medicines: Medicine[] }
  save: { medicines: Medicine[] }
  correctDetails: { medicines: MedicineRecord[] }
  changeStrength: { medicines: MedicineRecord[] }
  archive: { medicines: MedicineRecord[] }
  restore: { medicines: MedicineRecord[] }
  delete: { deletion: MedicineDeleteReceipt }
}
export type MedicineCommand =
  | { operation: 'list'; ownerId: string }
  | { operation: 'save'; ownerId: string; medicine: Medicine }
  | { operation: 'correctDetails'; ownerId: string; correction: DetailCorrection }
  | { operation: 'changeStrength'; ownerId: string; change: StrengthChange }
  | { operation: 'archive'; ownerId: string; archive: MedicineArchive }
  | { operation: 'restore'; ownerId: string; restore: MedicineRestore }
  | { operation: 'delete'; ownerId: string; deletion: MedicineDelete }

export type MedicineResponse<C extends MedicineCommand = MedicineCommand> =
  MedicineResponses[C['operation']]

export function parseMedicine(value: unknown): Medicine {
  if (!value || typeof value !== 'object') throw new ApplicationError('validation', 400)
  const input = value as Record<string, unknown>
  if (
    typeof input.id !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.id) ||
    typeof input.label !== 'string' ||
    !input.label.trim() ||
    input.label.trim().length > 120 ||
    (input.strength != null &&
      (typeof input.strength !== 'string' || input.strength.trim().length > 120)) ||
    !isDoseUnit(input.unit)
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
export function parseMedicineRecord(value: unknown): MedicineRecord {
  const medicine = parseMedicine(value)
  const input = value as Record<string, unknown>
  if (
    !Number.isSafeInteger(input.revision) ||
    (input.revision as number) < 0 ||
    (input.lastActionId !== null &&
      (typeof input.lastActionId !== 'string' || !uuid.test(input.lastActionId))) ||
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
    if (!row || typeof row.id !== 'string' || !uuid.test(row.id) || !isInstant(row.effectiveAt))
      throw new ApplicationError('validation', 400)
    const details = parseMedicine({ ...row, id: row.id })
    if (!Array.isArray(row.previousValues)) throw new ApplicationError('validation', 400)
    const previousValues = row.previousValues.map((value) => {
      const prior = parseMedicine({ ...(value as object), id: row.id })
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
    : parseMedicine(value)
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
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
  unit: DoseUnit
}
export type StrengthChange = {
  actionId: string
  medicineId: string
  expectedRevision: number
  strength: string | null
  effectiveAt: string
  timeZone: 'Europe/Istanbul'
}

function parseEditKey(value: unknown) {
  if (!value || typeof value !== 'object') throw new ApplicationError('validation', 400)
  const input = value as Record<string, unknown>
  if (
    typeof input.actionId !== 'string' ||
    !uuid.test(input.actionId) ||
    typeof input.medicineId !== 'string' ||
    !uuid.test(input.medicineId) ||
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
  if (typeof input.strengthRevisionId !== 'string' || !uuid.test(input.strengthRevisionId))
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
