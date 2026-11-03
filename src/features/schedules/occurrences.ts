import { istanbulDate, type DailySchedule, type DoseOccurrence, type Today } from './contract'

// Immutable initial schedule versions are the source of occurrence identities.
// Generation is bounded to Today and the next configured date, never a growing backlog.
export function scheduleToday(schedules: DailySchedule[], now: Date): Today {
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
        // Istanbul uses UTC+03:00. Device-local Date parsing is never used.
        const dueAt = new Date(`${dateString}T${slot.time}:00+03:00`).toISOString()
        if (dueAt <= schedule.confirmedAt) continue
        occurrences.push({
          id: `${schedule.id}:${dueAt}`,
          scheduleId: schedule.id,
          medicineId: schedule.medicineId,
          dueAt,
          quantity: slot.quantity,
          status: dueAt < nowIso ? 'Not logged' : dueAt === nowIso ? 'Due now' : 'Upcoming',
        })
      }
    }
  }
  occurrences.sort((a, b) => a.dueAt.localeCompare(b.dueAt) || a.id.localeCompare(b.id))
  return {
    date,
    now: nowIso,
    doses: occurrences.filter((dose) => istanbulDate(new Date(dose.dueAt)) === date),
    next: occurrences.find((dose) => dose.dueAt >= nowIso) ?? null,
  }
}
