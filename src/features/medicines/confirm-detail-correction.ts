import type { QueryClient } from '@tanstack/react-query'
import type { StrengthSnapshot } from '@/lib/strength-snapshot'
import type { Medicine, MedicineRecord } from './contract'
import { medicineKeys } from './queries'
import { scheduleKeys } from '../schedules/queries'

/** A correction receipt authoritatively fixes the selected period's loaded dose facts. Dose
 * revisions track dose edits, not medication corrections. After cancelling older reads, publish
 * this receipt directly rather than asking the dose-edit merger to accept an equal revision.
 * Never run while editing, or on a rejected/unconfirmed attempt.
 */
export async function confirmDetailCorrection(
  client: QueryClient,
  medicine: MedicineRecord,
  periodId: string,
  active: () => boolean,
) {
  await client.cancelQueries({ queryKey: scheduleKeys.all })
  if (!active()) return
  const current = client
    .getQueryData<Medicine[]>(medicineKeys.list())
    ?.find((value) => value.id === medicine.id)
  const latest = (current?.revision ?? -1) > medicine.revision ? current : medicine
  const period =
    latest?.strengthRevisions?.find((value) => value.id === periodId) ??
    medicine.strengthRevisions.find((value) => value.id === periodId)!
  function correct<T extends StrengthSnapshot>(value: T): T {
    return value.strengthRevisionId === periodId
      ? { ...value, strength: period.strength, medicineLabel: period.label, unit: period.unit }
      : value
  }
  for (const query of client.getQueryCache().findAll({ queryKey: scheduleKeys.all })) {
    const data = query.state.data
    let next = data
    if (Array.isArray(data))
      next = data.map((value) =>
        'record' in value ? { ...value, record: correct(value.record) } : correct(value),
      )
    else if (data && typeof data === 'object' && 'records' in data && Array.isArray(data.records))
      next = { ...data, records: data.records.map(correct) }
    if (next !== data) query.setState({ data: next })
  }
}
