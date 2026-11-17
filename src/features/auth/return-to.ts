import { isMedicationsReturnTo } from '@/features/medicines/routes'
import {
  reminderDueAt,
  reminderDueLink,
  reminderDueParam,
  reminderLinkFor,
  reminderLinkParam,
  reminderOccurrence,
} from '@/features/schedules/reminder-link'

/** Carried to sign-in in place of any save detail. */
export const saveInProgressNotice = 'save-in-progress'

/** The complete set of private destinations supported by sign-in. */
export function safeReturnTo(value: unknown): string {
  if (typeof value !== 'string') return '/'
  if (['/', '/history', '/settings'].includes(value)) return value
  // A signed-out Reminder link returns to itself, so the drawer opens after sign-in (#367).
  if (value.startsWith(`/?${reminderLinkParam}=`)) {
    const occurrence = reminderOccurrence(
      new URLSearchParams(value.slice(2)).get(reminderLinkParam),
    )
    return occurrence && reminderLinkFor(occurrence) === value ? value : '/'
  }
  // A signed-out grouped Reminder link returns to itself, so its screen opens after sign-in (#374).
  if (value.startsWith(`/?${reminderDueParam}=`)) {
    const dueAt = reminderDueAt(new URLSearchParams(value.slice(2)).get(reminderDueParam))
    return dueAt && reminderDueLink(dueAt) === value ? value : '/'
  }
  if (/^\/history\?date=\d{4}-\d{2}-\d{2}$/.test(value)) {
    const date = value.slice('/history?date='.length)
    const parsed = new Date(`${date}T00:00:00Z`)
    return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date
      ? value
      : '/'
  }
  return isMedicationsReturnTo(value) ? value : '/'
}

/** Auth.js stores an absolute callback URL. Never accept another origin. */
export function callbackReturnTo(value: string | undefined, origin: string): string {
  if (!value || /[\\\u0000-\u0020]/.test(value)) return '/'
  if (value.startsWith('/')) return safeReturnTo(value)
  try {
    const url = new URL(value, origin)
    if (url.origin !== new URL(origin).origin || url.hash || url.username || url.password)
      return '/'
    if (value !== `${url.origin}${url.pathname}${url.search}`) return '/'
    return safeReturnTo(`${url.pathname}${url.search}`)
  } catch {
    return '/'
  }
}
