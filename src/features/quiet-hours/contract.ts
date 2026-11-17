// Runtime-neutral Quiet hours commands (#35, docs/product/reminders.md #35). Quiet hours are one
// account-wide preference, off by default, with a fixed window: 23:00 inclusive to 08:00
// exclusive, Europe/Istanbul. A set names an action UUID; a retry returns its original outcome.
// Every response is `{ quietHours }`.
import { istanbulHour } from '../../lib/calendar-date'
import { ApplicationError } from '../../lib/application-error'

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type QuietHours = { quietHours: boolean }
export type QuietHoursChange = QuietHours & { actionId: string }

export type QuietHoursCommand =
  | { operation: 'read'; ownerId: string }
  | { operation: 'set'; ownerId: string; change: QuietHoursChange }

/** Whether an instant falls inside the Quiet hours window, 23:00 to 08:00 Istanbul. */
export function isQuietTime(instant: string): boolean {
  const hour = istanbulHour(instant)
  return hour >= 23 || hour < 8
}

export function parseQuietHoursChange(value: unknown): QuietHoursChange {
  const input = value as Record<string, unknown> | null
  if (
    typeof input?.actionId !== 'string' ||
    !uuid.test(input.actionId) ||
    typeof input.quietHours !== 'boolean'
  )
    throw new ApplicationError('validation', 400)
  return { actionId: input.actionId.toLowerCase(), quietHours: input.quietHours }
}

export function parseQuietHours(value: unknown): QuietHours {
  const input = value as Record<string, unknown> | null
  if (typeof input?.quietHours !== 'boolean') throw new Error('quiet hours contract')
  return { quietHours: input.quietHours }
}
