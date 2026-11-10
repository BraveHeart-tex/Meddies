import { z } from 'zod'
import { isTimeOfDay } from '@/lib/time-of-day'
import {
  formatQuantity,
  parseQuantity,
  quantityProblem,
  quantityRule,
  type DoseUnit,
} from '@/lib/dose-quantity'
import { isScheduleDate, type DailySchedule } from './contract'
import { lastDayProblem } from './last-day'
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
  /** The current Schedule version a change edits. */
  current?: DailySchedule
}

/**
 * The first date of either schedule kind: today or later, or an earlier date that is still
 * allowed, such as an unconfirmed save's.
 */
export function startDateSchema(today: string, ...allowed: (string | undefined)[]) {
  return z.string().superRefine((value, ctx) => {
    if (!isScheduleDate(value) || !value.startsWith('20'))
      ctx.addIssue({ code: 'custom', message: 'Choose a date.' })
    else if (value < today && !allowed.includes(value))
      ctx.addIssue({ code: 'custom', message: 'Choose today or a later date.' })
  })
}

/** The optional Last day, checked against the schedule's first date by its form. */
export const lastDaySchema = z.string().nullable()

export function scheduleFormSchema({ unit, today, retryStartDate, current }: ScheduleFormOptions) {
  return z
    .object({
      // A change has no Start date: it starts at its Edit time (767·A2).
      startDate: current ? z.string() : startDateSchema(today, retryStartDate),
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
            if (problem)
              ctx.addIssue({ code: 'custom', message: problem, path: [index, 'quantity'] })
          })
        })
        .transform((rows) =>
          rows.map((row) => ({ time: row.time, quantity: parseQuantity(row.quantity) as number })),
        ),
      lastDay: lastDaySchema,
    })
    .superRefine(({ startDate, lastDay }, ctx) => {
      // A change starts at its Edit time, so its Last day is today or later (779·A18).
      const problem = lastDayProblem(lastDay, today, current ? today : startDate)
      if (problem) ctx.addIssue({ code: 'custom', message: problem, path: ['lastDay'] })
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
    lastDay: null,
  }
}

/**
 * A change opens on the current Clock schedule version, or, switching from an Interval schedule,
 * every day with one empty time and its quantity carried over (767·A2, A9).
 */
export function scheduleChangeDefaults(current: DailySchedule, today: string): ScheduleFormValues {
  return current.intervalHours == null
    ? {
        startDate: today,
        weekdays: [...current.weekdays],
        times: current.times.map((slot) => ({
          time: slot.time,
          quantity: formatQuantity(slot.quantity),
        })),
        lastDay: current.endDate ?? null,
      }
    : {
        startDate: today,
        weekdays: [...ALL_WEEKDAYS],
        times: [{ time: '', quantity: formatQuantity(current.times[0].quantity) }],
        lastDay: current.endDate ?? null,
      }
}

/** Whether Clock schedule values differ from `before`, ignoring day and time order. */
export function clockValuesDiffer(values: ScheduleFormValues, before: ScheduleFormValues) {
  const comparable = ({ weekdays, times, lastDay }: ScheduleFormValues) =>
    JSON.stringify({
      lastDay,
      weekdays: [...new Set(weekdays)].sort((a, b) => a - b),
      times: times
        .map((slot) => ({ time: slot.time, quantity: parseQuantity(slot.quantity) }))
        .sort((a, b) => a.time.localeCompare(b.time)),
    })
  return comparable(values) !== comparable(before)
}

export function newTimeRow(unit: DoseUnit) {
  return { time: '', quantity: quantityRule(unit).initial }
}
