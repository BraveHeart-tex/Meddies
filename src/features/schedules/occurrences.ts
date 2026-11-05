import {
  istanbulDate,
  type DailySchedule,
  type DoseOccurrence,
  type DoseRecord,
  type DoseOutcomeRecord,
  type Today,
} from './contract'

// Immutable initial schedule versions are the source of occurrence identities.
// Generation is bounded to Today and the next configured date, never a growing backlog.
export function scheduledInstant(date: string, time: string) {
  // Istanbul uses UTC+03:00 for the supported schedule dates.
  return new Date(`${date}T${time}:00+03:00`).toISOString()
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
    for (let day = 0; day < 2; day++) {
      const localDate = new Date(`${firstDate}T12:00:00Z`)
      localDate.setUTCDate(localDate.getUTCDate() + day)
      const dateString = localDate.toISOString().slice(0, 10)
      for (const slot of schedule.times) {
        const dueAt = scheduledInstant(dateString, slot.time)
        if (dueAt <= schedule.confirmedAt) continue
        const id = `${schedule.id}:${dueAt}`
        const record = outcomes.get(id)
        const occurrence: DoseOccurrence = !record
          ? {
              id,
              scheduleId: schedule.id,
              medicineId: schedule.medicineId,
              dueAt,
              quantity: slot.quantity,
              status: dueAt < nowIso ? 'Not logged' : dueAt === nowIso ? 'Due now' : 'Upcoming',
            }
          : record.outcome === 'Taken'
            ? {
                id,
                scheduleId: schedule.id,
                medicineId: schedule.medicineId,
                dueAt,
                quantity: slot.quantity,
                status: 'Taken',
                record,
              }
            : {
                id,
                scheduleId: schedule.id,
                medicineId: schedule.medicineId,
                dueAt,
                quantity: slot.quantity,
                status: 'Skipped',
                record,
              }
        occurrences.push(occurrence)
      }
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
