import { z } from 'zod'
import { formatShortDay, formatTime } from '@/lib/calendar-date'
import { isTimeOfDay } from '@/lib/time-of-day'
import { nextClockDoses } from './clock-preview'
import { istanbulDate, type DailySchedule } from './contract'
import { intervalAnchor, nextIntervalDoses } from './interval-preview'
import { untilLastDay } from './last-day'
import { scheduledInstant } from './occurrences'

// Resume rules shared by Medication detail and the Resume schedule screen (#233, #237). The
// Worker stays authoritative; these mirror it for inline feedback.

/** The first dose a resumed version expects after `now`, within its Last day; null for none. */
export function firstDoseAfterResume(
  schedule: Pick<
    DailySchedule,
    'startDate' | 'anchorDate' | 'weekdays' | 'times' | 'intervalHours' | 'endDate'
  >,
  now: string,
) {
  const doses =
    schedule.intervalHours != null
      ? nextIntervalDoses({
          anchor: intervalAnchor(schedule),
          hours: schedule.intervalHours,
          now,
          count: 1,
        })
      : nextClockDoses({
          weekdays: schedule.weekdays,
          times: schedule.times.map((slot) => slot.time),
          // Resume keeps a later start date (#26 "Resume before start").
          now: [now, scheduledInstant(schedule.startDate, '00:00')].sort().at(-1) as string,
          count: 1,
        })
  return untilLastDay(doses, schedule.endDate ?? null)[0] ?? null
}

/** "today at 20:00" or "Tue 10 Nov at 08:00". */
export function doseWhen(dose: string, today: string) {
  const day = istanbulDate(new Date(dose)) === today ? 'today' : formatShortDay(dose, today)
  return `${day} at ${formatTime(dose)}`
}

/** A new Anchor: today or later, and no later than the Last day (233·A11). */
export function resumeFormSchema({ today, lastDay }: { today: string; lastDay: string | null }) {
  return z.object({
    date: z.string().superRefine((date, ctx) => {
      if (date < today) ctx.addIssue({ code: 'custom', message: 'Choose today or a later date.' })
      else if (lastDay && date > lastDay)
        ctx.addIssue({
          code: 'custom',
          message: `Choose ${formatShortDay(lastDay, today)} or an earlier date.`,
        })
    }),
    time: z.string().refine(isTimeOfDay, 'Choose a time.'),
  })
}

export type ResumeValues = z.input<ReturnType<typeof resumeFormSchema>>

/** The Starts row opens on today with no time (233·A9). */
export const resumeDefaults = (today: string): ResumeValues => ({ date: today, time: '' })

/** A new Anchor's doses after `now`, or null until a valid date and time are chosen. */
export function resumeDoses({ date, time }: ResumeValues, hours: number, now: string) {
  if (!date || !isTimeOfDay(time)) return null
  return nextIntervalDoses({ anchor: scheduledInstant(date, time), hours, now })
}
