// Runtime-neutral Unscheduled dose inputs and receipts. Clock and unit checks stay
// in the Worker after the owner-scoped medication lookup.
import { isInstant } from '../schedules/contract'
import { isDoseQuantity } from '../../lib/dose-quantity'
import { ApplicationError } from '../../lib/application-error'

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type UnscheduledDoseInput = {
  actionId: string
  medicineId: string
  takenAt: string
  quantity: number
}
export type UnscheduledDoseChange = {
  actionId: string
  doseId: string
  expectedRevision: number
} & ({ removed: true } | { removed: false; takenAt: string; quantity: number })
export type UnscheduledDose = {
  id: string
  actionId: string
  medicineId: string
  takenAt: string
  quantity: number
  outcome: 'Taken'
  revision: number
  removed: boolean
}
export function parseUnscheduledDose(value: unknown): UnscheduledDoseInput {
  if (!value || typeof value !== 'object') throw new ApplicationError('validation', 400)
  const input = value as Record<string, unknown>
  if (
    typeof input.actionId !== 'string' ||
    !uuid.test(input.actionId) ||
    typeof input.medicineId !== 'string' ||
    !uuid.test(input.medicineId) ||
    !isInstant(input.takenAt) ||
    !isDoseQuantity(input.quantity)
  )
    throw new ApplicationError('validation', 400)
  return {
    actionId: input.actionId.toLowerCase(),
    medicineId: input.medicineId.toLowerCase(),
    takenAt: input.takenAt,
    quantity: input.quantity,
  }
}

export function parseUnscheduledDoseChange(value: unknown): UnscheduledDoseChange {
  if (!value || typeof value !== 'object') throw new ApplicationError('validation', 400)
  const input = value as Record<string, unknown>
  if (
    typeof input.actionId !== 'string' ||
    !uuid.test(input.actionId) ||
    typeof input.doseId !== 'string' ||
    !uuid.test(input.doseId) ||
    !Number.isSafeInteger(input.expectedRevision) ||
    (input.expectedRevision as number) < 0 ||
    typeof input.removed !== 'boolean'
  )
    throw new ApplicationError('validation', 400)
  const key = {
    actionId: input.actionId.toLowerCase(),
    doseId: input.doseId.toLowerCase(),
    expectedRevision: input.expectedRevision as number,
  }
  if (input.removed) {
    if ('takenAt' in input || 'quantity' in input) throw new ApplicationError('validation', 400)
    return { ...key, removed: true }
  }
  if (!isInstant(input.takenAt) || !isDoseQuantity(input.quantity))
    throw new ApplicationError('validation', 400)
  return { ...key, removed: false, takenAt: input.takenAt, quantity: input.quantity }
}

export function parseUnscheduledDoseRecord(value: unknown): UnscheduledDose {
  const input = value as Record<string, unknown>
  const dose = parseUnscheduledDose(value)
  if (
    typeof input.id !== 'string' ||
    !uuid.test(input.id) ||
    input.outcome !== 'Taken' ||
    !Number.isSafeInteger(input.revision) ||
    (input.revision as number) < 0 ||
    typeof input.removed !== 'boolean'
  )
    throw new ApplicationError('validation', 400)
  return {
    ...dose,
    id: input.id.toLowerCase(),
    outcome: 'Taken',
    revision: input.revision as number,
    removed: input.removed,
  }
}
