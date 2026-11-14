import { z } from 'zod'
import { formatTime, shiftDate } from '@/lib/calendar-date'
import { isTimeOfDay } from '@/lib/time-of-day'
import { formatQuantity, parseQuantity, quantityProblem, type DoseUnit } from '@/lib/dose-quantity'
import { isScheduleDate, isTakenDateAllowed, istanbulDate } from './contract'

// Client-side Taken intake rules for inline feedback; the Worker stays authoritative. A scheduled
// dose (dueAt given) follows the Taken time window (isTakenTimeAllowed); an Unscheduled dose keeps
// today or yesterday. Times are Istanbul local minutes, 'YYYY-MM-DDTHH:MM'.

export type TakenAtChoice = 'now' | 'scheduled' | 'other'

/** The Istanbul local minute of an instant. */
export const localMinute = (instant: string) =>
  `${istanbulDate(new Date(instant))}T${formatTime(instant)}`

/** The instant of an Istanbul local minute (Istanbul keeps UTC+3 all year). */
export const instantOf = (local: string) => new Date(`${local}+03:00`)

/** The calendar day before 'YYYY-MM-DD'. */
export const previousDate = (date: string) =>
  new Date(Date.parse(`${date}T12:00:00Z`) - 86_400_000).toJSON().slice(0, 10)

/** The local minute a choice stands for, or null while Other is blank or half chosen. */
export function takenAtLocal(
  values: { when?: TakenAtChoice; date?: string; time?: string },
  now: string,
  scheduled: string,
) {
  if (values.when === 'now') return now
  if (values.when === 'scheduled') return scheduled
  return isScheduleDate(values.date) && isTimeOfDay(values.time ?? '')
    ? `${values.date}T${values.time}`
    : null
}

/**
 * The Taken date choices, oldest first, never after `today`: a scheduled dose's due date and the
 * days either side, or today and yesterday for an Unscheduled dose. A saved date outside them
 * stays offered, so a correction can keep its saved time.
 */
export function takenDayOptions({
  today,
  dueAt,
  saved,
}: {
  today: string
  dueAt?: string
  saved?: string
}): string[] {
  const days = dueAt
    ? [-1, 0, 1].map((offset) => shiftDate(istanbulDate(new Date(dueAt)), offset))
    : [previousDate(today), today]
  if (saved && isScheduleDate(saved) && !days.includes(saved)) days.push(saved)
  return days.filter((day) => day <= today).sort()
}

export type TakenFormOptions = {
  unit: DoseUnit
  /** The Now minute on screen; Save stores this minute. */
  now: string
  /** The dose's scheduled minute; never changes. */
  scheduled: string
  /** A scheduled dose's due instant: its Taken time window limits the date. */
  dueAt?: string
  /** A correction's current intake: an unchanged minute keeps its exact instant. */
  original?: { local: string; instant: string }
}

export function takenFormSchema({ unit, now, scheduled, dueAt, original }: TakenFormOptions) {
  const today = now.slice(0, 10)
  const yesterday = previousDate(today)
  // A scheduled correction may keep its saved minute even when an earlier save put it outside.
  const allowed = (local: string) =>
    dueAt
      ? original?.local === local || isTakenDateAllowed(local.slice(0, 10), dueAt)
      : local.slice(0, 10) === today || local.slice(0, 10) === yesterday
  const dateMessage = dueAt
    ? 'Choose a date within a day of the dose.'
    : 'Choose today or yesterday.'
  return z
    .object({
      when: z.enum(['now', 'scheduled', 'other']),
      date: z.string(),
      time: z.string(),
      quantity: z.string(),
    })
    .superRefine((values, ctx) => {
      if (values.when === 'scheduled' && scheduled > now)
        ctx.addIssue({ code: 'custom', message: 'Choose a time that has passed.', path: ['when'] })
      if (values.when === 'now' && !allowed(now))
        ctx.addIssue({
          code: 'custom',
          message: 'Choose a time within a day of the dose.',
          path: ['when'],
        })
      if (values.when === 'other') {
        if (!isScheduleDate(values.date))
          ctx.addIssue({ code: 'custom', message: 'Choose a date.', path: ['date'] })
        else if (!allowed(`${values.date}T${values.time}`))
          ctx.addIssue({ code: 'custom', message: dateMessage, path: ['date'] })
        else if (!isTimeOfDay(values.time))
          ctx.addIssue({ code: 'custom', message: 'Choose a time.', path: ['time'] })
        else if (`${values.date}T${values.time}` > now)
          ctx.addIssue({
            code: 'custom',
            message: 'Choose a time that has passed.',
            path: ['time'],
          })
      }
      const problem = quantityProblem(values.quantity, unit)
      if (problem) ctx.addIssue({ code: 'custom', message: problem, path: ['quantity'] })
    })
    .transform((values) => {
      // superRefine has passed, so Other is complete here.
      const local = takenAtLocal(values, now, scheduled) as string
      return {
        takenAt: original?.local === local ? original.instant : instantOf(local).toJSON(),
        quantity: parseQuantity(values.quantity) as number,
      }
    })
}

/** Editing values: the date and time may be blank or half chosen, the quantity any text. */
export type TakenFormValues = z.input<ReturnType<typeof takenFormSchema>>
/** Validated values, shaped like the Taken request details. */
export type TakenFormOutput = z.output<ReturnType<typeof takenFormSchema>>

/**
 * First recording: Now with the scheduled quantity. Editing an intake: Other at its recorded
 * minute and quantity, so the shown day is the actual day.
 */
export function takenFormDefaults(quantity: number, original?: { local: string }): TakenFormValues {
  return original
    ? {
        when: 'other',
        date: original.local.slice(0, 10),
        time: original.local.slice(11),
        quantity: formatQuantity(quantity),
      }
    : { when: 'now', date: '', time: '', quantity: formatQuantity(quantity) }
}
