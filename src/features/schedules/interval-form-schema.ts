import { z } from 'zod'
import { isTimeOfDay } from '@/lib/time-of-day'
import { parseQuantity, quantityProblem, quantityRule, type DoseUnit } from '@/lib/dose-quantity'
import { startDateSchema, type ScheduleFormOptions } from './schedule-form-schema'
import { ALL_WEEKDAYS } from './weekdays'

function hoursProblem(text: string) {
  const value = text.trim()
  if (!value) return 'Choose how many hours.'
  if (!/^-?\d+$/.test(value)) return 'Use whole hours, like 8.'
  const hours = Number(value)
  return hours < 1 || hours > 24 ? 'Use 1 to 24 hours.' : null
}

/** Client mirror of parseSchedule for an Interval schedule; the server parser stays authoritative. */
export function intervalFormSchema({ unit, today, retryStartDate }: ScheduleFormOptions) {
  return z
    .object({
      hours: z.string().superRefine((value, ctx) => {
        const problem = hoursProblem(value)
        if (problem) ctx.addIssue({ code: 'custom', message: problem })
      }),
      date: startDateSchema(today, retryStartDate),
      time: z.string().refine(isTimeOfDay, 'Choose a time.'),
      quantity: z.string().superRefine((value, ctx) => {
        const problem = quantityProblem(value, unit)
        if (problem) ctx.addIssue({ code: 'custom', message: problem })
      }),
    })
    .transform(({ hours, date, time, quantity }) => ({
      startDate: date,
      weekdays: [...ALL_WEEKDAYS],
      times: [{ time, quantity: parseQuantity(quantity) as number }],
      intervalHours: Number(hours.trim()),
    }))
}

/** Editing values: hours and first time start blank, and only the schema converts them. */
export type IntervalFormValues = z.input<ReturnType<typeof intervalFormSchema>>
export type IntervalFormOutput = z.output<ReturnType<typeof intervalFormSchema>>

/** New setup: today and one tablet or capsule are preselected (FE-764 Rules). */
export function intervalFormDefaults(unit: DoseUnit, today: string): IntervalFormValues {
  return { hours: '', date: today, time: '', quantity: quantityRule(unit).initial }
}
