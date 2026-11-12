// Weekdays are stored as JavaScript day numbers (0 Sunday to 6 Saturday); screens read Mon to Sun.

export const ALL_WEEKDAYS = [0, 1, 2, 3, 4, 5, 6]

/** Display order, Monday first (107·A7). */
export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0]

export const WEEKDAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
]

export const SHORT_WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/** 'Every day', or the chosen days Monday first: 'Mon, Wed, Fri' or 'Monday, Wednesday, Friday'. */
export function weekdaySummary(weekdays: readonly number[], length: 'short' | 'long'): string {
  if (ALL_WEEKDAYS.every((day) => weekdays.includes(day))) return 'Every day'
  const names = length === 'short' ? SHORT_WEEKDAYS : WEEKDAY_NAMES
  return WEEK_ORDER.filter((day) => weekdays.includes(day))
    .map((day) => names[day])
    .join(', ')
}
