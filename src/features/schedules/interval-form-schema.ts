import { z } from 'zod'
import { isTimeOfDay } from '@/lib/time-of-day'
import {
  formatQuantity,
  parseQuantity,
  quantityProblem,
  quantityRule,
  type DoseUnit,
} from '@/lib/dose-quantity'
import type { DailySchedule } from './contract'
import { lastDayProblem } from './last-day'
import { lastDaySchema, startDateSchema, type ScheduleFormOptions } from './schedule-form-schema'
import { ALL_WEEKDAYS } from './weekdays'

function hoursProblem(text: string) {
  const value = text.trim()
  if (!value) return 'Choose how many hours.'
  if (!/^-?\d+$/.test(value)) return 'Use whole hours, like 8.'
  const hours = Number(value)
  return hours < 1 || hours > 24 ? 'Use 1 to 24 hours.' : null
}

/** Client mirror of parseSchedule for an Interval schedule; the server parser stays authoritative. */
export function intervalFormSchema({ unit, today, retryStartDate, current }: ScheduleFormOptions) {
  // Editing an Interval schedule keeps its Anchor, however long ago it was (767·A5).
  const kept = current?.intervalHours != null ? current : undefined
  return z
    .object({
      hours: z.string().superRefine((value, ctx) => {
        const problem = hoursProblem(value)
        if (problem) ctx.addIssue({ code: 'custom', message: problem })
      }),
      date: startDateSchema(today, retryStartDate, kept?.startDate),
      time: z.string().refine(isTimeOfDay, 'Choose a time.'),
      quantity: z.string().superRefine((value, ctx) => {
        const problem = quantityProblem(value, unit)
        if (problem) ctx.addIssue({ code: 'custom', message: problem })
      }),
      lastDay: lastDaySchema,
    })
    .superRefine(({ date, time, lastDay }, ctx) => {
      // The Anchor date is the first date (779·A5).
      const problem = lastDayProblem(lastDay, today, date)
      if (problem) ctx.addIssue({ code: 'custom', message: problem, path: ['lastDay'] })
      // A new Anchor starts today or later; only the kept one may be earlier.
      if (kept && date < today && date !== retryStartDate && time !== kept.times[0].time)
        ctx.addIssue({ code: 'custom', message: 'Choose today or a later date.', path: ['date'] })
    })
    .transform(({ hours, date, time, quantity, lastDay }) => ({
      startDate: date,
      weekdays: [...ALL_WEEKDAYS],
      times: [{ time, quantity: parseQuantity(quantity) as number }],
      intervalHours: Number(hours.trim()),
      lastDay,
    }))
}

/** Editing values: hours and first time start blank, and only the schema converts them. */
export type IntervalFormValues = z.input<ReturnType<typeof intervalFormSchema>>
export type IntervalFormOutput = z.output<ReturnType<typeof intervalFormSchema>>

/** New setup: today and one tablet or capsule are preselected (#212 Rules). */
export function intervalFormDefaults(unit: DoseUnit, today: string): IntervalFormValues {
  return { hours: '', date: today, time: '', quantity: quantityRule(unit).initial, lastDay: null }
}

/**
 * A change opens on the current Interval schedule version and its Anchor, or, switching from set
 * times, asks for Every and Starts again with the quantity carried over (767·A4, A6).
 */
export function intervalChangeDefaults(current: DailySchedule, today: string): IntervalFormValues {
  const quantity = formatQuantity(current.times[0].quantity)
  const lastDay = current.endDate ?? null
  return current.intervalHours == null
    ? { hours: '', date: today, time: '', quantity, lastDay }
    : {
        hours: String(current.intervalHours),
        date: current.startDate,
        time: current.times[0].time,
        quantity,
        lastDay,
      }
}

/** Whether Interval schedule values differ from `before`. */
export function intervalValuesDiffer(values: IntervalFormValues, before: IntervalFormValues) {
  const comparable = ({ hours, date, time, quantity, lastDay }: IntervalFormValues) =>
    JSON.stringify([hours.trim(), date, time, parseQuantity(quantity), lastDay])
  return comparable(values) !== comparable(before)
}
