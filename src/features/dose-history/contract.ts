// Runtime-neutral Dose history read (#386, docs/product/medication-domain.md #385). One
// medication's Taken doses, scheduled under any Schedule version and Unscheduled, at their latest
// values, grouped by the Istanbul day of their intake time, newest first. A page holds whole days;
// `before` is the oldest day returned and null after the first Taken dose. The first page (no
// `before`) carries the summary; later pages carry `summary: null`. Totals add quantities in the
// Quantity unit, one entry per saved strength.
import { ApplicationError } from '../../lib/application-error'
import { isInstant, isScheduleDate } from '../schedules/contract'

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type DoseHistoryRequest = { medicineId: string; before: string | null }
export type DoseHistoryCommand = { operation: 'read'; ownerId: string } & DoseHistoryRequest

type DoseFields = {
  /** The dose's History date, where it can be corrected: its due day, or intake day if Unscheduled. */
  historyDate: string
  takenAt: string
  quantity: number
  unit: string
  strength: string | null
  revision: number
}
export type DoseHistoryDose =
  | ({ kind: 'scheduled'; scheduleId: string; dueAt: string } & DoseFields)
  | ({ kind: 'unscheduled'; id: string } & DoseFields)
export type DoseHistoryTotal = { quantity: number; unit: string; strength: string | null }
export type DoseHistoryDay = { date: string; doses: DoseHistoryDose[]; totals: DoseHistoryTotal[] }
export type DoseHistorySummary = {
  lastDose: DoseHistoryDose | null
  today: DoseHistoryTotal[]
  last7Days: DoseHistoryTotal[]
  last30Days: DoseHistoryTotal[]
}
export type DoseHistory = {
  medicineId: string
  days: DoseHistoryDay[]
  before: string | null
  summary: DoseHistorySummary | null
}

/** Parses `{ medicineId, before? }`; `before` is a date-only cursor from a previous page. */
export function parseDoseHistoryRequest(value: unknown): DoseHistoryRequest {
  const input = value as Record<string, unknown> | null
  const before = input?.before ?? null
  if (
    typeof input?.medicineId !== 'string' ||
    !uuid.test(input.medicineId) ||
    (before !== null && !isScheduleDate(before))
  )
    throw new ApplicationError('validation', 400)
  return { medicineId: input.medicineId.toLowerCase(), before }
}

/** Totals per saved strength, in first-seen order, summed on a thousandth grid. */
export function doseTotals(doses: DoseHistoryDose[]): DoseHistoryTotal[] {
  const totals = new Map<string, DoseHistoryTotal>()
  for (const { quantity, unit, strength } of doses) {
    const key = JSON.stringify([strength, unit])
    const total = totals.get(key) ?? { quantity: 0, unit, strength }
    // Quantity grids are 0.1 or coarser, so thousandths remove float drift such as 0.30000000000000004.
    total.quantity = Math.round((total.quantity + quantity) * 1000) / 1000
    totals.set(key, total)
  }
  return [...totals.values()]
}

const fail = (): never => {
  throw new Error('dose history contract')
}
const text = (value: unknown) => (typeof value === 'string' ? value : fail())
const date = (value: unknown) => (isScheduleDate(value) ? value : fail())

function parseTotals(value: unknown): DoseHistoryTotal[] {
  if (!Array.isArray(value)) fail()
  return (value as Record<string, unknown>[]).map((total) => ({
    quantity: typeof total?.quantity === 'number' ? total.quantity : fail(),
    unit: text(total.unit),
    strength: total.strength === null ? null : text(total.strength),
  }))
}

function parseDose(value: unknown): DoseHistoryDose {
  const dose = (value ?? fail()) as Record<string, unknown>
  const fields: DoseFields = {
    historyDate: date(dose.historyDate),
    takenAt: isInstant(dose.takenAt) ? dose.takenAt : fail(),
    quantity: typeof dose.quantity === 'number' && dose.quantity > 0 ? dose.quantity : fail(),
    unit: text(dose.unit),
    strength: dose.strength === null ? null : text(dose.strength),
    revision: Number.isInteger(dose.revision) ? (dose.revision as number) : fail(),
  }
  if (dose.kind === 'scheduled')
    return {
      kind: 'scheduled',
      scheduleId: text(dose.scheduleId),
      dueAt: isInstant(dose.dueAt) ? dose.dueAt : fail(),
      ...fields,
    }
  if (dose.kind === 'unscheduled') return { kind: 'unscheduled', id: text(dose.id), ...fields }
  return fail()
}

/** Decodes the Worker response; a malformed body is a gateway failure. */
export function parseDoseHistory(value: unknown): DoseHistory {
  const input = (value ?? fail()) as Record<string, unknown>
  if (!Array.isArray(input.days)) fail()
  const summary = input.summary as Record<string, unknown> | null
  return {
    medicineId: text(input.medicineId),
    days: (input.days as Record<string, unknown>[]).map((day) => ({
      date: date(day?.date),
      doses: Array.isArray(day.doses) ? day.doses.map(parseDose) : fail(),
      totals: parseTotals(day.totals),
    })),
    before: input.before === null ? null : date(input.before),
    summary:
      summary === null
        ? null
        : {
            lastDose: summary?.lastDose === null ? null : parseDose(summary?.lastDose),
            today: parseTotals(summary.today),
            last7Days: parseTotals(summary.last7Days),
            last30Days: parseTotals(summary.last30Days),
          },
  }
}
