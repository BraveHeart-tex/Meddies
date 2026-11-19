// What Dose history shows (#388, docs/product/medication-domain.md #385): the loaded pages with
// this medication's Pending and Unconfirmed saves laid over them. A save with an intake shows its
// attempted values in place of the dose it changes, or as a new dose, marked as saving, and counts
// in its day and window totals; a pending skip or removal keeps the dose, marked. Page one holds
// only 14 intake days, so window totals adjust the read's summary rather than recount loaded days.
import { istanbulDate, shiftDate } from '@/lib/calendar-date'
import type { PendingDose } from '../schedules/dose-save-state'
import {
  doseTotals,
  type DoseHistory,
  type DoseHistoryDose,
  type DoseHistoryTotal,
} from './contract'

export type ShownDose = DoseHistoryDose & { pending?: PendingDose }
export type ShownDay = { date: string; doses: ShownDose[]; totals: DoseHistoryTotal[] }
export type DoseWindows = Record<'today' | 'last7Days' | 'last30Days', DoseHistoryTotal[]>
export type DoseHistoryView = {
  lastDose: ShownDose | null
  windows: DoseWindows
  days: ShownDay[]
}

type Intake = { takenAt: string; quantity: number }
/** A scheduled dose's save: `taken` when it saves Taken. */
export type ScheduledOverlay = {
  scheduleId: string
  dueAt: string
  taken?: Intake
  pending: PendingDose
}
/** An Unscheduled save: `dose` is the saved dose it changes or removes, null for a new log. */
export type UnscheduledOverlay = {
  id: string
  dose: (Intake & { id: string; strength?: string | null; unit?: string }) | null
  taken?: Intake
  pending: PendingDose
}

const doseKey = (dose: DoseHistoryDose) =>
  dose.kind === 'scheduled' ? `s|${dose.scheduleId}|${dose.dueAt}` : `u|${dose.id}`

/** The Istanbul day of a dose's intake, which groups it. */
export const intakeDay = (dose: Pick<DoseHistoryDose, 'takenAt'>) =>
  istanbulDate(new Date(dose.takenAt))

/** Adds or removes one dose's amount from a total list; a new strength leads, as the newest. */
function adjust(totals: DoseHistoryTotal[], dose: DoseHistoryDose, sign: 1 | -1) {
  const index = totals.findIndex(
    (total) => total.strength === dose.strength && total.unit === dose.unit,
  )
  if (index < 0)
    return sign > 0
      ? [{ quantity: dose.quantity, unit: dose.unit, strength: dose.strength }, ...totals]
      : totals
  const quantity = Math.round((totals[index].quantity + sign * dose.quantity) * 1000) / 1000
  return quantity > 0
    ? totals.with(index, { ...totals[index], quantity })
    : totals.filter((_, at) => at !== index)
}

export function doseHistoryView({
  pages,
  scheduled,
  unscheduled,
  medicine,
  today,
}: {
  pages: readonly DoseHistory[]
  scheduled: readonly ScheduledOverlay[]
  unscheduled: readonly UnscheduledOverlay[]
  medicine: { unit: string; strength: string | null }
  today: string
}): DoseHistoryView {
  // Days never repeat across pages; a refetched page wins over nothing older.
  const server = new Map<string, DoseHistoryDose>()
  for (const page of pages)
    for (const day of page.days)
      for (const dose of day.doses) if (!server.has(doseKey(dose))) server.set(doseKey(dose), dose)

  /** Each overlay: the server dose it replaces, and what shows instead (null keeps it). */
  const overlays = new Map<
    string,
    { replaced: DoseHistoryDose | null; shown: DoseHistoryDose | null; pending: PendingDose }
  >()
  for (const save of scheduled) {
    const key = `s|${save.scheduleId}|${save.dueAt}`
    const replaced = server.get(key) ?? null
    const shown: DoseHistoryDose | null = save.taken
      ? {
          kind: 'scheduled',
          scheduleId: save.scheduleId,
          dueAt: save.dueAt,
          historyDate: istanbulDate(new Date(save.dueAt)),
          ...save.taken,
          unit: replaced?.unit ?? medicine.unit,
          strength: replaced ? replaced.strength : medicine.strength,
          revision: replaced?.revision ?? 0,
        }
      : null
    overlays.set(key, { replaced, shown, pending: save.pending })
  }
  for (const save of unscheduled) {
    // An unconfirmed log may already be saved: its intake then matches a server dose.
    const logged = !save.dose
      ? [...server.values()].find(
          (dose) =>
            dose.kind === 'unscheduled' &&
            dose.takenAt === save.taken?.takenAt &&
            dose.quantity === save.taken?.quantity &&
            !overlays.has(doseKey(dose)),
        )
      : undefined
    const key = logged ? doseKey(logged) : `u|${save.dose?.id ?? save.id}`
    const loaded = server.get(key)
    const replaced: DoseHistoryDose | null =
      loaded ??
      (save.dose && {
        kind: 'unscheduled',
        id: save.dose.id,
        historyDate: intakeDay(save.dose),
        takenAt: save.dose.takenAt,
        quantity: save.dose.quantity,
        unit: save.dose.unit ?? medicine.unit,
        strength: save.dose.strength === undefined ? medicine.strength : save.dose.strength,
        revision: 0,
      })
    const id = loaded?.kind === 'unscheduled' ? loaded.id : (save.dose?.id ?? save.id)
    const shown: DoseHistoryDose | null = save.taken
      ? {
          kind: 'unscheduled',
          id,
          historyDate: intakeDay(save.taken),
          ...save.taken,
          unit: replaced?.unit ?? medicine.unit,
          strength: replaced ? replaced.strength : medicine.strength,
          revision: replaced?.revision ?? 0,
        }
      : null
    overlays.set(key, { replaced, shown, pending: save.pending })
  }

  const doses: ShownDose[] = []
  for (const [key, dose] of server) {
    const overlay = overlays.get(key)
    doses.push(overlay ? { ...(overlay.shown ?? dose), pending: overlay.pending } : dose)
  }
  for (const [key, overlay] of overlays)
    if (overlay.shown && !server.has(key))
      doses.push({ ...overlay.shown, pending: overlay.pending })
  doses.sort((a, b) => b.takenAt.localeCompare(a.takenAt))

  // With older days still unloaded, a save older than the loaded days waits for its page.
  const last = pages.at(-1)
  const oldest = last?.before ? last.days.at(-1)?.date : undefined
  const shown = oldest ? doses.filter((dose) => intakeDay(dose) >= oldest) : doses

  const days: ShownDay[] = []
  for (const dose of shown) {
    const date = intakeDay(dose)
    if (days.at(-1)?.date === date) days.at(-1)!.doses.push(dose)
    else days.push({ date, doses: [dose], totals: [] })
  }
  for (const day of days) day.totals = doseTotals(day.doses)

  const summary = pages[0]?.summary
  const starts = {
    today,
    last7Days: shiftDate(today, -6),
    last30Days: shiftDate(today, -29),
  } as const
  const windows: DoseWindows = {
    today: summary?.today ?? [],
    last7Days: summary?.last7Days ?? [],
    last30Days: summary?.last30Days ?? [],
  }
  for (const { replaced, shown: instead } of overlays.values()) {
    if (!instead) continue
    for (const name of Object.keys(starts) as (keyof DoseWindows)[]) {
      if (replaced && intakeDay(replaced) >= starts[name])
        windows[name] = adjust(windows[name], replaced, -1)
      if (intakeDay(instead) >= starts[name]) windows[name] = adjust(windows[name], instead, 1)
    }
  }
  return { lastDose: doses[0] ?? null, windows, days }
}
