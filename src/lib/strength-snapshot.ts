import { ApplicationError } from './application-error'

// Optional only for old Worker responses during release overlap. New writes always
// resolve these fields authoritatively in D1, never from submitted preview values.
export type StrengthSnapshot = {
  strengthRevisionId?: string
  strength?: string | null
  medicineLabel?: string
  unit?: string
}
export function parseStrengthSnapshot(value: Record<string, unknown>): StrengthSnapshot {
  if (value.strengthRevisionId === undefined) return {}
  if (
    typeof value.strengthRevisionId !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value.strengthRevisionId,
    ) ||
    (value.strength !== null && typeof value.strength !== 'string') ||
    typeof value.medicineLabel !== 'string' ||
    typeof value.unit !== 'string'
  )
    throw new ApplicationError('validation', 400)
  return {
    strengthRevisionId: value.strengthRevisionId,
    strength: value.strength,
    medicineLabel: value.medicineLabel,
    unit: value.unit,
  }
}
