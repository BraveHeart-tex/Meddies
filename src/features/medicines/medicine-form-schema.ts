import { z } from 'zod'
import { isTimeOfDay } from '@/lib/time-of-day'
import { isScheduleDate } from '../schedules/contract'
import { instantOf } from '../schedules/taken-form-schema'
import {
  isWritableMedicineType,
  parseQuantity,
  stockCountProblem,
  writableMedicineTypes,
} from '@/lib/quantity-policy'

// Client-side mirror of parseMedicine in contract.ts for inline feedback. The server parser
// stays authoritative; keep trimming and the 120-character limits in step with it. Types come
// from the quantity policy. The optional Stock count validates against the Type chosen at save.
const tooLong = 'Use 120 characters or fewer.'

/** Names Add medicine's session draft and session save. */
export const medicineAddKey = 'medicine:add'

/** Name, Type and Strength: shared by Add medicine and the Detail correction form. */
export const medicineDetailsSchema = z.object({
  label: z.string().trim().min(1, 'Enter the medication name.').max(120, tooLong),
  strength: z
    .string()
    .trim()
    .max(120, tooLong)
    .transform((value) => value || null),
  // Editing starts with an empty unit; only a chosen unit passes.
  unit: z
    .enum(['', ...writableMedicineTypes])
    .pipe(z.enum(writableMedicineTypes, { error: 'Choose a type.' })),
})

/** Add medicine: the details plus the optional Stock count. */
export const medicineFormSchema = medicineDetailsSchema
  // Empty keeps stock off; a count turns it on as the starting count.
  .extend({ stock: z.string() })
  .superRefine((values, context) => {
    if (!isWritableMedicineType(values.unit)) return
    const problem = stockCountProblem(values.stock, values.unit)
    if (problem) context.addIssue({ code: 'custom', path: ['stock'], message: problem })
  })
  .transform(({ stock, ...medicine }): MedicineDetails & { startingCount?: number } => {
    const startingCount = parseQuantity(stock)
    return startingCount === null ? medicine : { ...medicine, startingCount }
  })

/** Detail editing values and validated details, without the Stock count. */
export type MedicineDetailsValues = z.input<typeof medicineDetailsSchema>
export type MedicineDetails = z.output<typeof medicineDetailsSchema>

/** Editing values: unit is empty until chosen. */
export type MedicineFormValues = z.input<typeof medicineFormSchema>
/** Validated values, shaped like the saved medicine without its id. */
export type MedicineFormOutput = z.output<typeof medicineFormSchema>

export const medicineFormDefaults: MedicineFormValues = {
  label: '',
  strength: '',
  unit: '',
  stock: '',
}

/** Record edits keep the base revision and raw Type correction draft through navigation. */
export function medicineRecordSchema(
  strength: boolean,
  now: () => Date,
  latestTakenAt: string | null | undefined,
) {
  return medicineDetailsSchema
    .extend({
      expectedRevision: z.number(),
      repairUnit: z.string().default(''),
      correctionStockCount: z.string().default(''),
      repairs: z.record(z.string(), z.string()).default({}),
      strength: strength
        ? z
            .string()
            .trim()
            .min(1, 'Enter the new strength.')
            .max(120, 'Use 120 characters or fewer.')
        : medicineDetailsSchema.shape.strength,
      date: z.string().refine((value) => !strength || isScheduleDate(value), 'Choose a date.'),
      time: z.string().refine((value) => !strength || isTimeOfDay(value), 'Choose a time.'),
    })
    .superRefine((values, context) => {
      if (!strength || !isScheduleDate(values.date) || !isTimeOfDay(values.time)) return
      const at = instantOf(`${values.date}T${values.time}`).getTime()
      if (at > now().getTime())
        context.addIssue({
          code: 'custom',
          path: ['time'],
          message: 'Choose a time no later than now.',
        })
      if (latestTakenAt && at < Date.parse(latestTakenAt))
        context.addIssue({
          code: 'custom',
          path: ['time'],
          message: 'Choose a time no earlier than the latest dose recorded as Taken.',
        })
    })
}
