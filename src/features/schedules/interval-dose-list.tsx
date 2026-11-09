import { formatShortDay, formatTime } from '@/lib/calendar-date'
import { istanbulDate } from './contract'
import { intervalLabel } from './interval-preview'

const isToday = (dose: string, today: string) => istanbulDate(new Date(dose)) === today

/** 'Every 7 hours · Next at 11:00', naming the day only when it isn't today. */
export function intervalRowSummary(hours: number, next: string, today: string) {
  const day = isToday(next, today) ? '' : `${formatShortDay(next, today)} `
  return `${intervalLabel(hours)} · Next ${day}at ${formatTime(next)}`
}

/** Upcoming doses of an Interval schedule: the time, then the day it falls on. */
export function IntervalDoseList({ doses, today }: { doses: string[]; today: string }) {
  return (
    <ul className="divide-y">
      {doses.map((dose) => (
        <li key={dose} className="flex flex-wrap items-baseline justify-between gap-2 py-3">
          <span className="text-heading font-extrabold">{formatTime(dose)}</span>
          <span className="text-body-sm">
            {isToday(dose, today) ? 'Today' : formatShortDay(dose, today)}
          </span>
        </li>
      ))}
    </ul>
  )
}
