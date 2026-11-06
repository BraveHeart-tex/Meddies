// 24-hour times of day ('HH:MM'). While editing, a picker value may hold one half only ('08:' or
// ':15') so neither half is lost; only `isTimeOfDay` values are complete.

export type TimeParts = { hour: string; minute: string }

/** The hour and minute of a complete, partial ('08:', ':15') or empty time value. */
export function timeParts(value: string): TimeParts {
  const [hour = '', minute = ''] = value ? value.split(':') : []
  return { hour, minute }
}

/** The value for the chosen halves: '' when neither is chosen, otherwise 'HH:MM', 'HH:' or ':MM'. */
export function joinTime({ hour, minute }: TimeParts): string {
  return hour || minute ? `${hour}:${minute}` : ''
}

/** Whether a value is a complete 24-hour time. */
export function isTimeOfDay(value: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value)
}
