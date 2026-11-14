import type { Medicine } from '@/features/medicines/contract'
import { formatShortDay, formatTime } from '@/lib/calendar-date'
import { quantityLabel } from '@/lib/dose-quantity'
import { takenDate, type UnscheduledDose } from './contract'

type Named = Pick<Medicine, 'label' | 'unit'>
type Taken = Pick<UnscheduledDose, 'takenAt' | 'quantity'>

/** '10:00', or '23:30 on Sun 8 Nov' when the dose was not taken today. */
export function takenWhen(dose: Pick<UnscheduledDose, 'takenAt'>, today: string) {
  const date = takenDate(dose)
  return `${formatTime(dose.takenAt)}${date === today ? '' : ` on ${formatShortDay(date, today)}`}`
}

/**
 * The save Toast (241·S2, S3, S7): 'Ibuprofen · taken at 10:00, 1 tablet', naming the day when it
 * is not today, or 'Ibuprofen · changed to taken at 09:15, 1 tablet' after a change. A change to
 * the amount alone reads 'Ibuprofen 09:30 · now 1 tablet' (#283).
 */
export function savedMessage(medicine: Named, dose: Taken, today: string, previous?: Taken) {
  if (previous?.takenAt === dose.takenAt)
    return `${medicine.label} ${takenWhen(dose, today)} · now ${quantityLabel(dose.quantity, medicine.unit)}`
  const verb = previous ? 'changed to taken at' : 'taken at'
  return `${medicine.label} · ${verb} ${takenWhen(dose, today)}, ${quantityLabel(dose.quantity, medicine.unit)}`
}

/** The removal Toast (241·S10): 'Ibuprofen 09:30 · dose removed'. */
export const removedMessage = (medicine: Named, dose: Pick<UnscheduledDose, 'takenAt'>) =>
  `${medicine.label} ${formatTime(dose.takenAt)} · dose removed`
