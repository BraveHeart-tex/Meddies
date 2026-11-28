import { isInstant, parseSchedule, parseScheduleEdit, type DailySchedule } from './contract'

function matchingSchedule(value: unknown, payload: Record<string, unknown>): DailySchedule {
  const saved = parseSchedule(value, 'read')
  const attempted = parseSchedule(payload)
  const confirmedAt = (value as Record<string, unknown>).confirmedAt
  if (!isInstant(confirmedAt) || JSON.stringify(saved) !== JSON.stringify(attempted))
    throw new Error('Schedule confirmation does not match attempt')
  return { ...saved, confirmedAt }
}

/** A confirmed change must be the attempted Schedule version, whatever dates the server set. */
function matchingChange(value: unknown, payload: Record<string, unknown>): DailySchedule {
  const saved = parseSchedule(value, 'read')
  const attempted = parseScheduleEdit(payload)
  const confirmedAt = (value as Record<string, unknown>).confirmedAt
  const same = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right)
  if (
    !isInstant(confirmedAt) ||
    saved.id !== attempted.id ||
    !same(saved.times, attempted.times) ||
    !same(saved.weekdays, attempted.weekdays) ||
    saved.intervalHours !== attempted.intervalHours ||
    saved.endDate !== attempted.endDate ||
    (attempted.anchorDate !== undefined && saved.startDate !== attempted.anchorDate)
  )
    throw new Error('Schedule confirmation does not match attempt')
  return { ...saved, confirmedAt, basedOnId: attempted.basedOnId, replacedAt: null }
}

export function matchScheduleConfirmation(
  data: unknown,
  payload: Record<string, unknown>,
  isChange: boolean,
): DailySchedule {
  const envelope = data as { schedules?: unknown[] } | null
  const value = envelope?.schedules?.[0]
  return isChange ? matchingChange(value, payload) : matchingSchedule(value, payload)
}
