import { SCHEDULE_TIMEZONE } from './contract'

export function formatHistoryTime(instant: string, includeDate = false) {
  const options: Intl.DateTimeFormatOptions = includeDate
    ? { dateStyle: 'medium', timeStyle: 'short' }
    : { hour: '2-digit', minute: '2-digit' }
  return new Intl.DateTimeFormat('en-GB', { timeZone: SCHEDULE_TIMEZONE, ...options }).format(
    new Date(instant),
  )
}
