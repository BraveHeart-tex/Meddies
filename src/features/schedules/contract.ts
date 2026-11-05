import { MedicineError } from '../medicines/contract'

export const SCHEDULE_TIMEZONE = 'Europe/Istanbul'
export type DailyScheduleInput = {
  id: string
  medicineId: string
  startDate: string
  times: { time: string; quantity: number }[]
}
export type DailySchedule = DailyScheduleInput & { confirmedAt: string }
export type ScheduleCommand =
  | { operation: 'list' | 'listOutcomes'; ownerId: string; date: string }
  | { operation: 'save'; ownerId: string; schedule: DailyScheduleInput }
  | { operation: 'recordTaken'; ownerId: string; record: TakenDoseInput }
  | { operation: 'recordSkipped'; ownerId: string; record: SkippedDoseInput }
  | { operation: 'correctOutcome'; ownerId: string; correction: DoseCorrectionInput }
export type DoseOccurrenceKey = { scheduleId: string; dueAt: string }
export type DoseCorrectionInput = DoseOccurrenceKey & {
  actionId: string
  expectedRevision: number
  expectedOutcome: DoseOutcomeRecord['outcome']
} & ({ outcome: 'Taken'; takenAt: string; quantity: number } | { outcome: 'Skipped' })
export type TakenDoseInput = DoseOccurrenceKey & {
  takenAt: string
  quantity: number
}
export type DoseRecord = TakenDoseInput & { outcome: 'Taken'; revision?: number; actionId?: string }
export type SkippedDoseInput = DoseOccurrenceKey
export type SkippedDoseRecord = SkippedDoseInput & {
  outcome: 'Skipped'
  recordedAt: string
  revision?: number
  actionId?: string
}
export type DoseOutcomeRecord = DoseRecord | SkippedDoseRecord
export type ScheduleResponse = { schedules?: DailySchedule[]; records?: DoseOutcomeRecord[] }
export type DoseOccurrence = {
  id: string
  scheduleId: string
  medicineId: string
  dueAt: string
  quantity: number
} & (
  | { status: 'Not logged' | 'Due now' | 'Upcoming' }
  | { status: 'Taken'; record: DoseRecord }
  | { status: 'Skipped'; record: SkippedDoseRecord }
)
export type Today = {
  date: string
  now: string
  doses: DoseOccurrence[]
  next: DoseOccurrence | null
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export function parseSchedule(value: unknown): DailyScheduleInput {
  if (!value || typeof value !== 'object') throw new MedicineError('validation', 400)
  const input = value as Record<string, unknown>
  if (
    typeof input.id !== 'string' ||
    !uuid.test(input.id) ||
    typeof input.medicineId !== 'string' ||
    !uuid.test(input.medicineId) ||
    !isScheduleDate(input.startDate) ||
    !input.startDate.startsWith('20') ||
    !Array.isArray(input.times) ||
    input.times.length < 1 ||
    input.times.length > 24
  )
    throw new MedicineError('validation', 400)
  const times = input.times
    .map((slot: unknown) => {
      if (!slot || typeof slot !== 'object') throw new MedicineError('validation', 400)
      const { time, quantity } = slot as Record<string, unknown>
      if (
        typeof time !== 'string' ||
        !/^([01]\d|2[0-3]):[0-5]\d$/.test(time) ||
        !isDoseQuantity(quantity)
      )
        throw new MedicineError('validation', 400)
      return { time, quantity }
    })
    .sort((a, b) => a.time.localeCompare(b.time))
  if (new Set(times.map((slot) => slot.time)).size !== times.length)
    throw new MedicineError('validation', 400)
  return {
    id: input.id.toLowerCase(),
    medicineId: input.medicineId,
    startDate: input.startDate,
    times,
  }
}

export function istanbulDate(now: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: SCHEDULE_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
}

export function isScheduleDate(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    new Date(`${value}T00:00:00Z`).toJSON()?.slice(0, 10) === value
  )
}

export function isInstant(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-/.test(value) && new Date(value).toJSON() === value
}

export function parseTakenDose(value: unknown): TakenDoseInput {
  const occurrence = parseOccurrenceKey(value)
  const { takenAt, quantity } = value as Record<string, unknown>
  if (!isInstant(takenAt) || !isDoseQuantity(quantity)) throw new MedicineError('validation', 400)
  return { ...occurrence, takenAt, quantity }
}

export function parseDoseCorrection(value: unknown): DoseCorrectionInput {
  const occurrence = parseOccurrenceKey(value)
  const input = value as Record<string, unknown>
  if (
    typeof input.actionId !== 'string' ||
    !uuid.test(input.actionId) ||
    !Number.isSafeInteger(input.expectedRevision) ||
    (input.expectedRevision as number) < 0 ||
    (input.expectedOutcome !== 'Taken' && input.expectedOutcome !== 'Skipped') ||
    (input.outcome !== 'Taken' && input.outcome !== 'Skipped') ||
    input.expectedOutcome === input.outcome
  )
    throw new MedicineError('validation', 400)
  if (input.outcome === 'Taken') {
    if (!isInstant(input.takenAt) || !isDoseQuantity(input.quantity))
      throw new MedicineError('validation', 400)
    return {
      ...occurrence,
      actionId: input.actionId.toLowerCase(),
      expectedRevision: input.expectedRevision as number,
      expectedOutcome: input.expectedOutcome as DoseOutcomeRecord['outcome'],
      outcome: 'Taken',
      takenAt: input.takenAt,
      quantity: input.quantity,
    }
  }
  if ('takenAt' in input || 'quantity' in input) throw new MedicineError('validation', 400)
  return {
    ...occurrence,
    actionId: input.actionId.toLowerCase(),
    expectedRevision: input.expectedRevision as number,
    expectedOutcome: input.expectedOutcome as DoseOutcomeRecord['outcome'],
    outcome: 'Skipped',
  }
}

export const parseSkippedDose = parseOccurrenceKey

function parseOccurrenceKey(value: unknown): DoseOccurrenceKey {
  if (!value || typeof value !== 'object') throw new MedicineError('validation', 400)
  const { scheduleId, dueAt } = value as Record<string, unknown>
  if (typeof scheduleId !== 'string' || !uuid.test(scheduleId) || !isInstant(dueAt))
    throw new MedicineError('validation', 400)
  return { scheduleId: scheduleId.toLowerCase(), dueAt }
}

export function parseDoseOutcomeRecord(value: unknown): DoseOutcomeRecord {
  if (!value || typeof value !== 'object') throw new MedicineError('validation', 400)
  const input = value as Record<string, unknown>
  const revision = input.revision === undefined ? undefined : input.revision
  if (revision !== undefined && (!Number.isSafeInteger(revision) || (revision as number) < 0))
    throw new MedicineError('validation', 400)
  const actionId = input.actionId == null ? undefined : input.actionId
  if (actionId !== undefined && (typeof actionId !== 'string' || !uuid.test(actionId)))
    throw new MedicineError('validation', 400)
  if (input.outcome === 'Taken') {
    const record = parseTakenDose(input)
    return {
      ...record,
      outcome: 'Taken',
      ...(revision === undefined ? {} : { revision: revision as number }),
      ...(actionId ? { actionId: actionId as string } : {}),
    }
  }
  if (input.outcome === 'Skipped') {
    const record = parseSkippedDose(input)
    if (!isInstant(input.recordedAt)) throw new MedicineError('validation', 400)
    return {
      ...record,
      recordedAt: input.recordedAt,
      outcome: 'Skipped',
      ...(revision === undefined ? {} : { revision: revision as number }),
      ...(actionId ? { actionId: actionId as string } : {}),
    }
  }
  throw new MedicineError('validation', 400)
}

function isDoseQuantity(value: unknown): value is number {
  return typeof value === 'number' && value > 0 && Number.isSafeInteger(value * 2)
}
