import { istanbulDate } from './contract'

/**
 * Reminder link (#367): `/?occurrence=<scheduleId>:<dueAt>` names an Occurrence by its schedule
 * and due instant only, never a medication. Today and History read it on the server; the screen
 * that lists the Occurrence opens its dose drawer once, then clears the parameter with
 * `history.replaceState` (DESIGN.md). Server-safe, so the reminder sender can build links.
 */
export const reminderLinkParam = 'occurrence'

const occurrencePattern =
  /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}):(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)$/i

/** The Occurrence id a Reminder link names, or null when the value is not one. */
export function reminderOccurrence(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const match = occurrencePattern.exec(value)
  if (!match) return null
  const [, scheduleId, dueAt] = match
  const time = Date.parse(dueAt)
  if (!Number.isFinite(time) || new Date(time).toISOString() !== dueAt) return null
  return `${scheduleId.toLowerCase()}:${dueAt}`
}

/** The Reminder link path for an Occurrence id from `reminderOccurrence`. */
export function reminderLinkFor(occurrence: string): string {
  return `/?${reminderLinkParam}=${encodeURIComponent(occurrence)}`
}

/** The Reminder link path for one schedule's dose due at `dueAt`. */
export function reminderLink({ scheduleId, dueAt }: { scheduleId: string; dueAt: string }) {
  const occurrence = reminderOccurrence(`${scheduleId}:${new Date(dueAt).toISOString()}`)
  if (!occurrence) throw new Error('Invalid reminder occurrence')
  return reminderLinkFor(occurrence)
}

/** The History date an Occurrence lists on: its due day. */
export function reminderHistoryDate(occurrence: string): string {
  return istanbulDate(new Date(occurrence.slice(occurrence.indexOf(':') + 1)))
}
