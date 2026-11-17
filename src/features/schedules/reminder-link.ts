import { istanbulDate } from './contract'

/**
 * Reminder link (#367): `/?occurrence=<scheduleId>:<dueAt>` names an Occurrence by its schedule
 * and due instant only, never a medication. Today and History read it on the server; the screen
 * that lists the Occurrence opens its dose drawer once, then clears the parameter with
 * `history.replaceState` (DESIGN.md). A grouped Reminder link, `/?due=<dueAt>` (#374), names only
 * the due instant several doses share; Today redirects it to the screen listing them, with no
 * drawer. Server-safe, so the reminder sender can build links.
 */
export const reminderLinkParam = 'occurrence'
export const reminderDueParam = 'due'

const instantPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/

function canonicalInstant(value: string) {
  const time = Date.parse(value)
  return Number.isFinite(time) && new Date(time).toISOString() === value
}

const occurrencePattern =
  /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}):(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)$/i

/** The Occurrence id a Reminder link names, or null when the value is not one. */
export function reminderOccurrence(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const match = occurrencePattern.exec(value)
  if (!match) return null
  const [, scheduleId, dueAt] = match
  if (!canonicalInstant(dueAt)) return null
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

/** The due instant a grouped Reminder link names, or null when the value is not one. */
export function reminderDueAt(value: unknown): string | null {
  return typeof value === 'string' && instantPattern.test(value) && canonicalInstant(value)
    ? value
    : null
}

/** The grouped Reminder link path for the doses due at `dueAt`. */
export function reminderDueLink(dueAt: string): string {
  const instant = reminderDueAt(new Date(dueAt).toISOString())
  if (!instant) throw new Error('Invalid reminder due instant')
  return `/?${reminderDueParam}=${encodeURIComponent(instant)}`
}
