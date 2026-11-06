import { ApplicationError } from '../../lib/application-error'

export type Medicine = {
  id: string
  label: string
  strength: string | null
  unit: 'tablet' | 'capsule'
}
export type MedicineResponses = { list: { medicines: Medicine[] }; save: { medicines: Medicine[] } }
export type MedicineCommand =
  | { operation: 'list'; ownerId: string }
  | { operation: 'save'; ownerId: string; medicine: Medicine }

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
    (input.unit !== 'tablet' && input.unit !== 'capsule')
  )
    throw new ApplicationError('validation', 400)
  return {
    id: input.id,
    label: input.label.trim(),
    strength: typeof input.strength === 'string' ? input.strength.trim() || null : null,
    unit: input.unit,
  }
}
