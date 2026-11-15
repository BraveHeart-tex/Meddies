import type { StrengthSnapshot } from '@/lib/strength-snapshot'
import { isDoseUnit } from '@/lib/dose-quantity'
import { instantOf, localMinute } from '../schedules/taken-form-schema'
import type { Medicine } from './contract'

/** Saved facts win over current medication details until an authoritative dose read updates them. */
export function medicineForDose(medicine: Medicine, snapshot: StrengthSnapshot): Medicine {
  if (!snapshot.strengthRevisionId) return medicine
  return {
    ...medicine,
    label: snapshot.medicineLabel ?? medicine.label,
    strength: snapshot.strength ?? null,
    unit: isDoseUnit(snapshot.unit) ? snapshot.unit : medicine.unit,
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
  scheduled = false,
}: {
  medicine: Medicine
  takenAt: string | null
  scheduled?: boolean
  original?: StrengthSnapshot & { takenAt: string }
}) {
  if (!takenAt || !medicine.strengthRevisions) return null
  const keeping = original?.strengthRevisionId && localMinute(original.takenAt) === takenAt
  const period = keeping ? original : strengthAt(medicine, instantOf(takenAt).toISOString())
  if (!period) return null
  return (
    <p role="status" className="text-body-sm text-muted-foreground">
      Strength to save:{' '}
      <strong className="text-foreground">{period.strength ?? 'No strength entered'}</strong>.
      {(keeping ? original.strengthRevisionId : 'id' in period ? period.id : undefined) !==
        medicine.currentStrengthRevisionId &&
        ` This is an earlier strength period.${scheduled ? ' Scheduled time stays the same.' : ''}`}
    </p>
  )
}
