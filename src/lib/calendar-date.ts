// Date-only values ('YYYY-MM-DD') are Istanbul calendar days. The calendar works with device-local
// Date objects, so convert through local noon: the day never shifts with the device timezone.

/** The device-local Date that shows a date-only value as its calendar day. */
export function calendarDay(value: string): Date {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, month - 1, day, 12)
}

/** The date-only value of a calendar day. */
export function dateValue(day: Date): string {
  const pad = (part: number) => String(part).padStart(2, '0')
  return `${day.getFullYear()}-${pad(day.getMonth() + 1)}-${pad(day.getDate())}`
}

const formats = {
  thisYear: new Intl.DateTimeFormat('en-GB', {
    timeZone: 'UTC',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }),
  otherYear: new Intl.DateTimeFormat('en-GB', {
    timeZone: 'UTC',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }),
}

/**
 * A readable label for a date-only value relative to `today`, the Istanbul date: 'Today, Fri 15
 * Jun', 'Thu 14 Jun', or 'Tue 1 Jan 2036' outside today's year.
 */
export function dateLabel(value: string, today: string): string {
  const [year, month, day] = value.split('-').map(Number)
  const format = value.slice(0, 4) === today.slice(0, 4) ? formats.thisYear : formats.otherYear
  // en-GB puts a comma after the weekday ('Fri, 15 Jun'); the design reads 'Fri 15 Jun'.
  const label = format.format(Date.UTC(year, month - 1, day)).replace(',', '')
  return value === today ? `Today, ${label}` : label
}

/** The date-only value `days` calendar days after `value` (negative for earlier days). */
export function shiftDate(value: string, days: number): string {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10)
}

const longFormats = {
  thisYear: new Intl.DateTimeFormat('en-GB', {
    timeZone: 'UTC',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }),
  otherYear: new Intl.DateTimeFormat('en-GB', {
    timeZone: 'UTC',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }),
}

/** A day heading for a date-only value: 'Thursday 5 November', with the year outside today's. */
export function longDateLabel(value: string, today: string): string {
  const [year, month, day] = value.split('-').map(Number)
  const format =
    value.slice(0, 4) === today.slice(0, 4) ? longFormats.thisYear : longFormats.otherYear
  return format.format(Date.UTC(year, month - 1, day)).replace(',', '')
}
