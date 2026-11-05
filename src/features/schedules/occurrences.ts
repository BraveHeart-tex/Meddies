import {
  istanbulDate,
  type DailySchedule,
  type DoseOccurrence,
  type DoseOutcomeRecord,
  type Today,
  scheduleRunsOn,
} from './contract'

// Immutable initial schedule versions are the source of occurrence identities.
// Generation is bounded to Today and the next configured date, never a growing backlog.
export function scheduledInstant(date: string, time: string) {
  // Istanbul uses UTC+03:00 for the supported schedule dates.
  return new Date(`${date}T${time}:00+03:00`).toISOString()
}

function occurrenceFor(
  schedule: DailySchedule,
  dueAt: string,
  slot: DailySchedule['times'][number],
  nowIso: string,
  outcomes: Map<string, DoseOutcomeRecord>,
): DoseOccurrence | null {
  if (dueAt <= schedule.confirmedAt) return null
  const id = `${schedule.id}:${dueAt}`
  const record = outcomes.get(id)
  const base = {
    id,
    scheduleId: schedule.id,
    medicineId: schedule.medicineId,
    dueAt,
    quantity: slot.quantity,
  }
  if (!record)
    return {
      ...base,
      status: dueAt < nowIso ? 'Not logged' : dueAt === nowIso ? 'Due now' : 'Upcoming',
    }
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
      for (const slot of schedule.times) {
        const dueAt = scheduledInstant(dateString, slot.time)
        const occurrence = occurrenceFor(schedule, dueAt, slot, nowIso, outcomes)
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
    next:
      occurrences.find(
        (dose) => dose.dueAt >= nowIso && dose.status !== 'Taken' && dose.status !== 'Skipped',
      ) ?? null,
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
    for (const slot of schedule.times) {
      const dueAt = scheduledInstant(date, slot.time)
      if (dueAt >= nowIso) continue
      const occurrence = occurrenceFor(schedule, dueAt, slot, nowIso, outcomes)
      if (occurrence) doses.push(occurrence)
    }
  }
  return doses.sort((a, b) => a.dueAt.localeCompare(b.dueAt) || a.id.localeCompare(b.id))
}
