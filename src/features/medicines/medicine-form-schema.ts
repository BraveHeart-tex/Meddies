import { z } from 'zod'
import { writableMedicineTypes } from '@/lib/quantity-policy'

// Client-side mirror of parseMedicine in contract.ts for inline feedback. The server parser
// stays authoritative; keep trimming and the 120-character limits in step with it. Types come
// from the quantity policy.
const tooLong = 'Use 120 characters or fewer.'

/** Names Add medicine's session draft and session save. */
export const medicineAddKey = 'medicine:add'

export const medicineFormSchema = z.object({
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

/** Editing values: unit is empty until chosen. */
export type MedicineFormValues = z.input<typeof medicineFormSchema>
/** Validated values, shaped like the saved medicine without its id. */
export type MedicineFormOutput = z.output<typeof medicineFormSchema>

export const medicineFormDefaults: MedicineFormValues = { label: '', strength: '', unit: '' }
