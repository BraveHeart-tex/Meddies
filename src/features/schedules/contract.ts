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
  | { operation: 'list'; ownerId: string }
  | { operation: 'save'; ownerId: string; schedule: DailyScheduleInput }
export type DoseOccurrence = {
  id: string
  scheduleId: string
  medicineId: string
  dueAt: string
  quantity: number
  status: 'Not logged' | 'Due now' | 'Upcoming'
}
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
    typeof input.startDate !== 'string' ||
    !/^20\d{2}-\d{2}-\d{2}$/.test(input.startDate) ||
    new Date(`${input.startDate}T00:00:00Z`).toJSON()?.slice(0, 10) !== input.startDate ||
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
        typeof quantity !== 'number' ||
        !Number.isFinite(quantity) ||
        quantity <= 0 ||
        !Number.isSafeInteger(quantity * 2)
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
