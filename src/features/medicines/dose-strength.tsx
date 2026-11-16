import type { StrengthSnapshot } from '@/lib/strength-snapshot'
import { isMedicineType } from '@/lib/quantity-policy'
import { instantOf, localMinute } from '../schedules/taken-form-schema'
import type { Medicine } from './contract'

/** Saved facts win over current medication details until an authoritative dose read updates them. */
export function medicineForDose(medicine: Medicine, snapshot: StrengthSnapshot): Medicine {
  if (!snapshot.strengthRevisionId) return medicine
  return {
    ...medicine,
    label: snapshot.medicineLabel ?? medicine.label,
    strength: snapshot.strength ?? null,
    unit: isMedicineType(snapshot.unit) ? snapshot.unit : medicine.unit,
  }
}

/** Server order is effective time, then revision sequence. Retain input order for equal instants. */
export function strengthAt(medicine: Medicine, instant: string) {
  return medicine.strengthRevisions
    ?.filter((period) => Date.parse(period.effectiveAt) <= Date.parse(instant))
    .at(-1)
}

/** A correction keeping its saved minute keeps its exact instant and saved period, including
 * equality with a later Strength change. A changed time resolves through the current periods.
 */
export function DoseStrength({
  medicine,
  takenAt,
  original,
}: {
  medicine: Medicine
  takenAt: string | null
  original?: StrengthSnapshot & { takenAt: string }
}) {
  if (!takenAt || !medicine.strengthRevisions) return null
  const keeping = original?.strengthRevisionId && localMinute(original.takenAt) === takenAt
  const period = keeping ? original : strengthAt(medicine, instantOf(takenAt).toISOString())
  if (!period) return null
  return (
    <p role="status" className="text-body-sm text-muted-foreground">
      This dose will use{' '}
      <strong className="text-foreground">{period.strength ?? 'No strength entered'}</strong>, based
      on the time taken.
    </p>
  )
}
