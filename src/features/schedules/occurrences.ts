import {
  istanbulDate,
  type DailySchedule,
  type DoseOccurrence,
  type DoseOutcomeRecord,
  type Today,
  scheduleRunsOn,
} from './contract'

// Immutable Schedule versions are the source of occurrence identities.
// Generation is bounded to Today and the next configured date, never a growing backlog.
export function scheduledInstant(date: string, time: string) {
  // Istanbul uses UTC+03:00 for the supported schedule dates.
  return new Date(`${date}T${time}:00+03:00`).toISOString()
}

// Both projections and recording validation use this bounded sequence.
export function scheduleSlotsOn(
  schedule: Pick<
    DailySchedule,
    | 'startDate'
    | 'anchorDate'
    | 'endDate'
    | 'weekdays'
    | 'times'
    | 'intervalHours'
    | 'stoppedAt'
    | 'pausedAt'
  >,
  date: string,
) {
  if (!scheduleRunsOn(schedule, date)) return []
  if (schedule.intervalHours == null)
    return schedule.times.map((slot) => ({ dueAt: scheduledInstant(date, slot.time), slot }))
  const slot = schedule.times[0]
  const anchor = Date.parse(scheduledInstant(schedule.anchorDate ?? schedule.startDate, slot.time))
  const start = Date.parse(scheduledInstant(date, '00:00'))
  const end = start + 24 * 60 * 60 * 1000
  const step = schedule.intervalHours * 60 * 60 * 1000
  const slots = []
  for (
    let due = anchor + Math.max(0, Math.ceil((start - anchor) / step)) * step;
    due < end;
    due += step
  )
    slots.push({ dueAt: new Date(due).toISOString(), slot })
  return slots
}

/** How long an unresolved occurrence stays Due now after its due instant (#275). */
const DUE_NOW_WINDOW_MS = 15 * 60_000
/**
 * Up next features an unresolved occurrence due within the last 80 minutes, inclusive (#275):
 * through the whole 80th minute, so a 09:00 dose leads until the clock reads 10:21.
 */
const UP_NEXT_WINDOW_MS = 81 * 60_000

/**
 * The most recently due unresolved occurrence inside the Up next window, the first in To log's
 * order among those due at the same instant; otherwise the next Scheduled one. `occurrences` is
 * in To log's order: by due instant, then id.
 */
function upNext(occurrences: DoseOccurrence[], now: number) {
  const recent = occurrences.filter(
    (dose) =>
      (dose.status === 'Due now' || dose.status === 'Not logged') &&
      now < Date.parse(dose.dueAt) + UP_NEXT_WINDOW_MS,
  )
  const latest = recent.at(-1)
  return (
    recent.find((dose) => dose.dueAt === latest?.dueAt) ??
    occurrences.find((dose) => dose.status === 'Upcoming') ??
    null
  )
}

// Due now runs from the due instant until 15 minutes after it, exclusive; then Not logged.
function unresolvedStatus(dueAt: string, now: number) {
  const due = Date.parse(dueAt)
  if (now < due) return 'Upcoming'
  return now < due + DUE_NOW_WINDOW_MS ? 'Due now' : 'Not logged'
}

function occurrenceFor(
  schedule: DailySchedule,
  dueAt: string,
  slot: DailySchedule['times'][number],
  now: number,
  outcomes: Map<string, DoseOutcomeRecord>,
): DoseOccurrence | null {
  if (dueAt <= schedule.confirmedAt) return null
  const id = `${schedule.id}:${dueAt}`
  const record = outcomes.get(id)
  if (schedule.replacedAt && dueAt > schedule.replacedAt && !record) return null
  const base = {
    id,
    scheduleId: schedule.id,
    medicineId: schedule.medicineId,
    dueAt,
    quantity: slot.quantity,
  }
  if (!record) return { ...base, status: unresolvedStatus(dueAt, now) }
  return record.outcome === 'Taken'
    ? { ...base, status: 'Taken', record }
    : { ...base, status: 'Skipped', record }
}

export function scheduleToday(
  schedules: DailySchedule[],
  now: Date,
  records: DoseOutcomeRecord[],
): Today {
  const outcomes = new Map(
    records.map((record) => [`${record.scheduleId}:${record.dueAt}`, record]),
  )

  const date = istanbulDate(now)
  const nowIso = now.toISOString()
  const occurrences: DoseOccurrence[] = []
  for (const schedule of schedules) {
    const firstDate = schedule.startDate > date ? schedule.startDate : date
    // Scan a bounded week to find the next configured occurrence, including a sole weekday.
    for (let day = 0; day < 8; day++) {
      const localDate = new Date(`${firstDate}T12:00:00Z`)
      localDate.setUTCDate(localDate.getUTCDate() + day)
      const dateString = localDate.toISOString().slice(0, 10)
      if (!scheduleRunsOn(schedule, dateString)) continue
      for (const { dueAt, slot } of scheduleSlotsOn(schedule, dateString)) {
        const occurrence = occurrenceFor(schedule, dueAt, slot, now.getTime(), outcomes)
        if (occurrence) occurrences.push(occurrence)
      }
      if (dateString > date) break
    }
  }
  occurrences.sort((a, b) => a.dueAt.localeCompare(b.dueAt) || a.id.localeCompare(b.id))
  return {
    date,
    now: nowIso,
    doses: occurrences.filter((dose) => istanbulDate(new Date(dose.dueAt)) === date),
    next: upNext(occurrences, now.getTime()),
  }
}

export function scheduleHistoryDay(
  schedules: DailySchedule[],
  date: string,
  now: Date,
  records: DoseOutcomeRecord[],
): DoseOccurrence[] {
  const outcomes = new Map(
    records.map((record) => [`${record.scheduleId}:${record.dueAt}`, record]),
  )
  const nowIso = now.toISOString()
  const doses: DoseOccurrence[] = []
  for (const schedule of schedules) {
    if (!scheduleRunsOn(schedule, date)) continue
    for (const { dueAt, slot } of scheduleSlotsOn(schedule, date)) {
      if (dueAt > nowIso) continue
      const occurrence = occurrenceFor(schedule, dueAt, slot, now.getTime(), outcomes)
      if (occurrence) doses.push(occurrence)
    }
  }
  return doses.sort((a, b) => a.dueAt.localeCompare(b.dueAt) || a.id.localeCompare(b.id))
}
