import { formatShortDay, formatTime } from '@/lib/calendar-date'
import type { StrengthRevision } from './contract'

/** The initial period's year-1 storage boundary is not a user-entered start date. */
export function strengthPeriodDescription(periods: StrengthRevision[], id: string, today: string) {
  const index = periods.findIndex((period) => period.id === id)
  const period = periods[index]
  const next = periods[index + 1]
  const start = period.effectiveAt.startsWith('0001-01-01')
    ? 'First strength period'
    : `From ${formatShortDay(period.effectiveAt, today)} at ${formatTime(period.effectiveAt)}`
  return `${start}${next ? ` until ${formatShortDay(next.effectiveAt, today)} at ${formatTime(next.effectiveAt)}` : ' onwards'}.`
}
