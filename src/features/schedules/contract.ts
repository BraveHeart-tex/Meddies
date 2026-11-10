import { isDoseQuantity } from '../../lib/dose-quantity'
import { ApplicationError } from '../../lib/application-error'
import { ALL_WEEKDAYS } from './weekdays'

export { istanbulDate } from '../../lib/calendar-date'

export type DailyScheduleInput = {
  id: string
  medicineId: string
  startDate: string
  times: { time: string; quantity: number }[]
  weekdays?: number[]
  intervalHours?: number | null
  endDate?: string | null
}
export type DailySchedule = DailyScheduleInput & {
  confirmedAt: string
  weekdays: number[]
  replacedAt?: string | null
}
export type ScheduleEditInput = {
  id: string
  basedOnId: string
  times: DailyScheduleInput['times']
  weekdays?: number[]
  intervalHours?: number | null
  anchorDate?: string
}
export type ScheduleCommand =
  | { operation: 'list'; ownerId: string; date?: string }
  | { operation: 'listOutcomes'; ownerId: string; date: string }
  | { operation: 'save'; ownerId: string; schedule: DailyScheduleInput }
  | { operation: 'edit'; ownerId: string; edit: ScheduleEditInput }
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
export type ScheduleResponses = {
  list: { schedules: DailySchedule[]; records?: DoseRecord[] }
  listOutcomes: { schedules: DailySchedule[]; records: DoseOutcomeRecord[] }
  save: { schedules: DailySchedule[] }
  edit: { schedules: DailySchedule[] }
  recordTaken: { records: DoseRecord[] }
  recordSkipped: { records: SkippedDoseRecord[] }
  correctOutcome: { records: DoseOutcomeRecord[] }
}
export type ScheduleResponse<C extends ScheduleCommand = ScheduleCommand> =
  ScheduleResponses[C['operation']]
export type SendSchedule = <C extends ScheduleCommand>(command: C) => Promise<ScheduleResponse<C>>

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
export function parseSchedule(
  value: unknown,
): DailyScheduleInput & { weekdays: number[]; endDate: string | null } {
  if (!value || typeof value !== 'object') throw new ApplicationError('validation', 400)
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
    throw new ApplicationError('validation', 400)
  const intervalHours = input.intervalHours === undefined ? null : input.intervalHours
  if (
    intervalHours !== null &&
    (typeof intervalHours !== 'number' ||
      !Number.isInteger(intervalHours) ||
      intervalHours < 1 ||
      intervalHours > 24 ||
      input.times.length !== 1)
  )
    throw new ApplicationError('validation', 400)
  const weekdays = input.weekdays === undefined ? [...ALL_WEEKDAYS] : input.weekdays
  if (
    !Array.isArray(weekdays) ||
    weekdays.length < 1 ||
    weekdays.some((day) => !Number.isInteger(day) || day < 0 || day > 6) ||
    new Set(weekdays).size !== weekdays.length
  )
    throw new ApplicationError('validation', 400)
  const endDate = input.endDate === undefined ? null : input.endDate
  if (endDate !== null && (!isScheduleDate(endDate) || endDate < input.startDate))
    throw new ApplicationError('validation', 400)
  const times = input.times
    .map((slot: unknown) => {
      if (!slot || typeof slot !== 'object') throw new ApplicationError('validation', 400)
      const { time, quantity } = slot as Record<string, unknown>
      if (
        typeof time !== 'string' ||
        !/^([01]\d|2[0-3]):[0-5]\d$/.test(time) ||
        !isDoseQuantity(quantity)
      )
        throw new ApplicationError('validation', 400)
      return { time, quantity }
    })
    .sort((a, b) => a.time.localeCompare(b.time))
  if (new Set(times.map((slot) => slot.time)).size !== times.length)
    throw new ApplicationError('validation', 400)
  return {
    id: input.id.toLowerCase(),
    medicineId: input.medicineId,
    startDate: input.startDate,
    times,
    weekdays: intervalHours === null ? [...weekdays].sort((a, b) => a - b) : [...ALL_WEEKDAYS],
    endDate,
    intervalHours,
  }
}

// Edits carry no start/end date or medicine identity. The server derives those
// from the current version and confirmation time; anchorDate is Interval-only.
export function parseScheduleEdit(value: unknown): ScheduleEditInput {
  if (!value || typeof value !== 'object') throw new ApplicationError('validation', 400)
  const input = value as Record<string, unknown>
  if (
    Object.keys(input).some(
      (key) =>
        !['id', 'basedOnId', 'times', 'weekdays', 'intervalHours', 'anchorDate'].includes(key),
    ) ||
    typeof input.basedOnId !== 'string' ||
    !uuid.test(input.basedOnId) ||
    (input.anchorDate !== undefined && !isScheduleDate(input.anchorDate))
  )
    throw new ApplicationError('validation', 400)
  const parsed = parseSchedule({ ...input, medicineId: input.basedOnId, startDate: '2026-01-01' })
  if (
    parsed.id === input.basedOnId.toLowerCase() ||
    (input.anchorDate !== undefined && parsed.intervalHours == null)
  )
    throw new ApplicationError('validation', 400)
  return {
    id: parsed.id,
    basedOnId: input.basedOnId.toLowerCase(),
    times: parsed.times,
    weekdays: parsed.weekdays,
    intervalHours: parsed.intervalHours,
    ...(input.anchorDate === undefined ? {} : { anchorDate: input.anchorDate as string }),
  }
}

export function isScheduleDate(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    new Date(`${value}T00:00:00Z`).toJSON()?.slice(0, 10) === value
  )
}

export function scheduleRunsOn(
  schedule: Pick<DailySchedule, 'startDate' | 'endDate' | 'weekdays'>,
  date: string,
): boolean {
  if (date < schedule.startDate || (schedule.endDate && date > schedule.endDate)) return false
  const [year, month, day] = date.split('-').map(Number)
  const weekday = new Date(Date.UTC(year, month - 1, day, 12)).getUTCDay()
  return (schedule.weekdays ?? ALL_WEEKDAYS).includes(weekday)
}

export function isInstant(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-/.test(value) && new Date(value).toJSON() === value
}

export function parseTakenDose(value: unknown): TakenDoseInput {
  const occurrence = parseOccurrenceKey(value)
  const { takenAt, quantity } = value as Record<string, unknown>
  if (!isInstant(takenAt) || !isDoseQuantity(quantity))
    throw new ApplicationError('validation', 400)
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
    (input.expectedOutcome === input.outcome && input.outcome !== 'Taken')
  )
    throw new ApplicationError('validation', 400)
  if (input.outcome === 'Taken') {
    if (!isInstant(input.takenAt) || !isDoseQuantity(input.quantity))
      throw new ApplicationError('validation', 400)
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
  if ('takenAt' in input || 'quantity' in input) throw new ApplicationError('validation', 400)
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
  if (!value || typeof value !== 'object') throw new ApplicationError('validation', 400)
  const { scheduleId, dueAt } = value as Record<string, unknown>
  if (typeof scheduleId !== 'string' || !uuid.test(scheduleId) || !isInstant(dueAt))
    throw new ApplicationError('validation', 400)
  return { scheduleId: scheduleId.toLowerCase(), dueAt }
}

export function parseDoseOutcomeRecord(value: unknown): DoseOutcomeRecord {
  if (!value || typeof value !== 'object') throw new ApplicationError('validation', 400)
  const input = value as Record<string, unknown>
  const revision = input.revision === undefined ? undefined : input.revision
  if (revision !== undefined && (!Number.isSafeInteger(revision) || (revision as number) < 0))
    throw new ApplicationError('validation', 400)
  const actionId = input.actionId == null ? undefined : input.actionId
  if (actionId !== undefined && (typeof actionId !== 'string' || !uuid.test(actionId)))
    throw new ApplicationError('validation', 400)
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
    if (!isInstant(input.recordedAt)) throw new ApplicationError('validation', 400)
    return {
      ...record,
      recordedAt: input.recordedAt,
      outcome: 'Skipped',
      ...(revision === undefined ? {} : { revision: revision as number }),
      ...(actionId ? { actionId: actionId as string } : {}),
    }
  }
  throw new ApplicationError('validation', 400)
}

// Browser compatibility: omitted outcome means Taken; Skipped rejects extra fields.
export function parseDoseOutcome(value: unknown): 'Taken' | 'Skipped' {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new ApplicationError('validation', 400)
  const input = value as Record<string, unknown>
  if (input.outcome === 'Skipped') {
    if (
      Object.keys(input).some((key) => !['outcome', 'scheduleId', 'dueAt', 'ownerId'].includes(key))
    )
      throw new ApplicationError('validation', 400)
    return 'Skipped'
  }
  if (input.outcome !== undefined && input.outcome !== 'Taken')
    throw new ApplicationError('validation', 400)
  return 'Taken'
}
