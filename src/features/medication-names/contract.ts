// Runtime-neutral Medication names commands (#37, docs/product/reminders.md #37). Medication names
// is one account-wide preference, off by default: on, dose reminders name the Medicines they cover.
// A set names an action UUID; a retry returns its original outcome. Every response is
// `{ medicationNames }`.
import { ApplicationError } from '../../lib/application-error'

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type MedicationNames = { medicationNames: boolean }
export type MedicationNamesChange = MedicationNames & { actionId: string }

export type MedicationNamesCommand =
  | { operation: 'read'; ownerId: string }
  | { operation: 'set'; ownerId: string; change: MedicationNamesChange }

export function parseMedicationNamesChange(value: unknown): MedicationNamesChange {
  const input = value as Record<string, unknown> | null
  if (
    typeof input?.actionId !== 'string' ||
    !uuid.test(input.actionId) ||
    typeof input.medicationNames !== 'boolean'
  )
    throw new ApplicationError('validation', 400)
  return { actionId: input.actionId.toLowerCase(), medicationNames: input.medicationNames }
}

export function parseMedicationNames(value: unknown): MedicationNames {
  const input = value as Record<string, unknown> | null
  if (typeof input?.medicationNames !== 'boolean') throw new Error('medication names contract')
  return { medicationNames: input.medicationNames }
}
