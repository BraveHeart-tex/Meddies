import { z } from 'zod'

// Client-side mirror of parseMedicine in contract.ts for inline feedback. The server parser
// stays authoritative; keep trimming, the 120-character limits and units in step with it.
const tooLong = 'Use 120 characters or fewer.'

export const medicineFormSchema = z.object({
  label: z.string().trim().min(1, 'Enter the medication name.').max(120, tooLong),
  strength: z
    .string()
    .trim()
    .max(120, tooLong)
    .transform((value) => value || null),
  // Editing starts with an empty unit; only a chosen unit passes.
  unit: z
    .enum(['', 'tablet', 'capsule'])
    .pipe(z.enum(['tablet', 'capsule'], { error: 'Choose tablet or capsule.' })),
})

/** Editing values: unit is empty until chosen (FE-647 D9). */
export type MedicineFormValues = z.input<typeof medicineFormSchema>
/** Validated values, shaped like the saved medicine without its id. */
export type MedicineFormOutput = z.output<typeof medicineFormSchema>

export const medicineFormDefaults: MedicineFormValues = { label: '', strength: '', unit: '' }
