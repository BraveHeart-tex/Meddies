import type { DoseOccurrence } from './contract'
import { scheduleToday } from './occurrences'
import type { ScheduleSnapshot } from './queries'
import { reminderHistoryDate, reminderLinkParam } from './reminder-link'

/**
 * Where a Reminder link opens, from the owner's Today read: `today` when Today lists the
 * Occurrence, else its History date's link, which History verifies against that day. A failed
 * read or a due day after today lands on Today with no drawer (`/`).
 */
export function reminderDestination(occurrence: string, snapshot: ScheduleSnapshot | undefined) {
  if (!snapshot) return '/'
  const today = scheduleToday(snapshot.schedules, new Date(snapshot.now), snapshot.records)
  if (today.doses.some((dose) => dose.id === occurrence)) return 'today'
  const date = reminderHistoryDate(occurrence)
  return date <= today.date
    ? `/history?date=${date}&${reminderLinkParam}=${encodeURIComponent(occurrence)}`
    : '/'
}

/** Whether History's read of `date` lists the Occurrence, so its drawer can open there. */
export function historyListsReminder(
  occurrence: string,
  date: string,
  doses: DoseOccurrence[] | undefined,
) {
  return reminderHistoryDate(occurrence) === date && !!doses?.some(({ id }) => id === occurrence)
}
