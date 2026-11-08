import { z } from 'zod'
import { formatTime } from '@/lib/calendar-date'
import { isTimeOfDay } from '@/lib/time-of-day'
import { formatQuantity, parseQuantity, quantityProblem, type DoseUnit } from '@/lib/dose-quantity'
import { isScheduleDate, istanbulDate } from './contract'

// Client-side Taken intake rules for inline feedback. parseTakenDose and parseDoseCorrection stay
// authoritative on the server. Times are Istanbul local minutes, 'YYYY-MM-DDTHH:MM'.

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

export type TakenFormOptions = {
  unit: DoseUnit
  /** The Now minute on screen; Save stores this minute (FE-648 D12). */
  now: string
  /** The dose's scheduled minute; never changes. */
  scheduled: string
  /** A correction's current intake: an unchanged minute keeps its exact instant. */
  original?: { local: string; instant: string }
}

export function takenFormSchema({ unit, now, scheduled, original }: TakenFormOptions) {
  const today = now.slice(0, 10)
  const yesterday = previousDate(today)
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
      if (values.when === 'other') {
        if (!isScheduleDate(values.date) || (values.date !== today && values.date !== yesterday))
          ctx.addIssue({ code: 'custom', message: 'Choose today or yesterday.', path: ['date'] })
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
 * minute and quantity, so the shown day is the actual day (FE-648 C3).
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
