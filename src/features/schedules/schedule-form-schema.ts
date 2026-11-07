import { z } from 'zod'
import { isTimeOfDay } from '@/lib/time-of-day'
import { parseQuantity, quantityProblem, quantityRule, type DoseUnit } from '@/lib/dose-quantity'
import { isScheduleDate } from './contract'
import { ALL_WEEKDAYS } from './weekdays'

// Client-side mirror of parseSchedule in contract.ts for inline feedback. The server parser stays
// authoritative; keep the 1-24 times, unique times, weekdays and half-unit quantities in step.

export type ScheduleFormOptions = {
  /** The medicine's unit; setup always belongs to one medicine (FE-647 A7). */
  unit: DoseUnit
  /** Istanbul today, from the scheduling clock. */
  today: string
  /** Start date of an unconfirmed save; its retry stays valid after midnight. */
  retryStartDate?: string
}

export function scheduleFormSchema({ unit, today, retryStartDate }: ScheduleFormOptions) {
  return z.object({
    startDate: z.string().superRefine((value, ctx) => {
      if (!isScheduleDate(value) || !value.startsWith('20'))
        ctx.addIssue({ code: 'custom', message: 'Choose a date.' })
      else if (value < today && value !== retryStartDate)
        ctx.addIssue({ code: 'custom', message: 'Choose today or a later date.' })
    }),
    weekdays: z
      .array(z.number().int().min(0).max(6))
      .min(1, 'Choose at least one day.')
      .transform((days) => [...new Set(days)].sort((a, b) => a - b)),
    times: z
      .array(z.object({ time: z.string(), quantity: z.string() }))
      .min(1, 'Add a time.')
      .max(24, 'Use 24 times or fewer.')
      // One pass so every row reports its own problem at once, duplicates included.
      .superRefine((rows, ctx) => {
        const seen = new Set<string>()
        rows.forEach((row, index) => {
          if (!isTimeOfDay(row.time))
            ctx.addIssue({ code: 'custom', message: 'Choose a time.', path: [index, 'time'] })
          else if (seen.has(row.time))
            ctx.addIssue({
              code: 'custom',
              message: `${row.time} is already in this schedule.`,
              path: [index, 'time'],
            })
          else seen.add(row.time)
          const problem = quantityProblem(row.quantity, unit)
          if (problem) ctx.addIssue({ code: 'custom', message: problem, path: [index, 'quantity'] })
        })
      })
      .transform((rows) =>
        rows.map((row) => ({ time: row.time, quantity: parseQuantity(row.quantity) as number })),
      ),
  })
}

/** Editing values: times may be half chosen and quantities blank (only the schema converts). */
export type ScheduleFormValues = z.input<ReturnType<typeof scheduleFormSchema>>
/** Validated values, shaped like the schedule request without its ids. */
export type ScheduleFormOutput = z.output<ReturnType<typeof scheduleFormSchema>>

/** New setup: every day from today, one empty time taking one tablet or capsule. */
export function scheduleFormDefaults(unit: DoseUnit, today: string): ScheduleFormValues {
  return {
    startDate: today,
    weekdays: [...ALL_WEEKDAYS],
    times: [newTimeRow(unit)],
  }
}

export function newTimeRow(unit: DoseUnit) {
  return { time: '', quantity: quantityRule(unit).initial }
}
