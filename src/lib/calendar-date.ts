// The one module that formats dates and times for the UI (docs/copy.md, Dates and times). It takes
// date-only values ('YYYY-MM-DD', Istanbul calendar days) and ISO instants. Lint keeps
// Intl.DateTimeFormat and toLocale*String out of the rest of src.

export const SCHEDULE_TIMEZONE = 'Europe/Istanbul'

/** The date-only value of an instant's Istanbul day. */
export function istanbulDate(now: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: SCHEDULE_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
}

/** The Istanbul hour of an instant, 0 to 23. */
export function istanbulHour(instant: string): number {
  return Number(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: SCHEDULE_TIMEZONE,
      hour: '2-digit',
      hourCycle: 'h23',
    }).format(new Date(instant)),
  )
}

// The calendar works with device-local Date objects, so convert through local noon: the day never
// shifts with the device timezone.

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

/** The date-only value `days` calendar days after `value` (negative for earlier days). */
export function shiftDate(value: string, days: number): string {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10)
}

const istanbulDay = (value: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : istanbulDate(new Date(value))

type Width = 'short' | 'long'

const dayFormats = new Map<Width, Intl.DateTimeFormat>()

function dayFormat(width: Width) {
  let format = dayFormats.get(width)
  if (!format) {
    format = new Intl.DateTimeFormat('en-GB', {
      timeZone: SCHEDULE_TIMEZONE,
      weekday: width,
      day: 'numeric',
      month: width,
      year: 'numeric',
    })
    dayFormats.set(width, format)
  }
  return format
}

// Parts, because the separators Intl puts between them differ across engines. Noon UTC is the same
// calendar day in Istanbul.
function dayParts(value: string, width: Width) {
  const [year, month, day] = istanbulDay(value).split('-').map(Number)
  const parts = dayFormat(width).formatToParts(Date.UTC(year, month - 1, day, 12))
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? ''
  return {
    weekday: part('weekday'),
    day: part('day'),
    month: part('month'),
    year: part('year'),
  }
}

const yearSuffix = (value: string, today: string, year: string) =>
  istanbulDay(value).slice(0, 4) === istanbulDay(today).slice(0, 4) ? '' : ` ${year}`

/** 'Tue 10 Nov', or 'Tue 1 Jan 2036' outside the year of `today`. */
export function formatShortDay(value: string, today: string): string {
  const { weekday, day, month, year } = dayParts(value, 'short')
  return `${weekday} ${day} ${month}${yearSuffix(value, today, year)}`
}

/** 'Tuesday, 10 November', or 'Tuesday, 1 January 2036' outside the year of `today`. */
export function formatLongDay(value: string, today: string): string {
  const { weekday, day, month, year } = dayParts(value, 'long')
  return `${weekday}, ${day} ${month}${yearSuffix(value, today, year)}`
}

/** 'Today, Sun 8 Nov', or the short day on any other day. */
export function formatTodayRelativeDay(value: string, today: string): string {
  const short = formatShortDay(value, today)
  return istanbulDay(value) === istanbulDay(today) ? `Today, ${short}` : short
}

const time = new Intl.DateTimeFormat('en-GB', {
  timeZone: SCHEDULE_TIMEZONE,
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

/** '14:05': the 24-hour Istanbul time of an instant. Midnight reads '00:00'. */
export function formatTime(instant: string | number): string {
  return time.format(new Date(instant))
}

/** The calendar caption: 'November 2026'. */
export function formatMonthYear(value: string): string {
  const { month, year } = dayParts(value, 'long')
  return `${month} ${year}`
}

/** The calendar's month label: 'Nov'. */
export function formatMonthName(value: string): string {
  return dayParts(value, 'short').month
}

/** The calendar's column heading: 'Mon'. */
export function formatShortWeekday(value: string): string {
  return dayParts(value, 'short').weekday
}

/** The calendar column's screen-reader name: 'Monday'. */
export function formatWeekdayName(value: string): string {
  return dayParts(value, 'long').weekday
}
