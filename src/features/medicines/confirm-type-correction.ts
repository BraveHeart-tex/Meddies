import { notifyManager, type QueryClient } from '@tanstack/react-query'
import { doseHistoryKeys } from '../dose-history/queries'
import { isHistoryKey, scheduleKeys, type ScheduleSnapshot } from '../schedules/queries'
import { isUnscheduledKey } from '../unscheduled-doses/queries'
import type { DailySchedule, DoseOccurrence, DoseOutcomeRecord } from '../schedules/contract'
import type { UnscheduledDose } from '../unscheduled-doses/contract'
import { formatTime } from '@/lib/calendar-date'
import { sessionSaves } from '@/lib/session-saves'
import type { StrengthSnapshot } from '@/lib/strength-snapshot'
import type { Medicine, MedicineRecord } from './contract'
import { medicineKeys, mergeClientMedicines } from './queries'
import type { TypeCorrection, TypeCorrectionReview } from './type-correction-contract'

type Repair = { previous: ReadonlySet<number>; quantity: number }

type Correction = {
  medicine: MedicineRecord
  repairs: Map<string, Repair>
  scheduleRepairs: Map<string, Map<string, Repair>>
}
const corrections = new WeakMap<QueryClient, Map<string, Correction>>()

/** Schedule slots keep their identity across a Type correction. The session keeps the confirmed
 * repairs so an older server handoff cannot overwrite them, even after Query garbage collection.
 * Dose writes have their own revisions and already arrive with the current Type.
 */
export function applyConfirmedTypeCorrections<T>(
  client: QueryClient,
  key: readonly unknown[],
  data: T,
): T {
  const confirmed = corrections.get(client)
  if (!confirmed?.size || !data) return data
  const entries = confirmed

  function repaired(quantity: number, repair?: Repair) {
    return repair?.previous.has(quantity) ? repair.quantity : quantity
  }

  function schedule(value: DailySchedule) {
    const repairs = entries.get(value.medicineId)?.scheduleRepairs.get(value.id)
    if (!repairs) return value
    return {
      ...value,
      times: value.times.map((slot) => ({
        ...slot,
        quantity: repaired(slot.quantity, repairs.get(slot.time)),
      })),
    }
  }
  const periods = new Map(
    [...confirmed.values()].flatMap((entry) =>
      entry.medicine.strengthRevisions.map((period) => [period.id, { entry, period }] as const),
    ),
  )
  function dose<D extends StrengthSnapshot & { quantity?: number }>(value: D, doseKey: string): D {
    const match = value.strengthRevisionId && periods.get(value.strengthRevisionId)
    if (!match || value.unit === match.period.unit) return value
    const { entry, period } = match
    const repair = entry.repairs.get(doseKey)
    return {
      ...value,
      unit: period.unit,
      strength: period.strength,
      medicineLabel: period.label,
      ...(value.quantity !== undefined && repair
        ? { quantity: repaired(value.quantity, repair) }
        : {}),
    }
  }
  function record(value: DoseOutcomeRecord) {
    return dose(value, `scheduled:${value.scheduleId}:${value.dueAt}`)
  }
  function occurrence(value: DoseOccurrence): DoseOccurrence {
    const slots = entries.get(value.medicineId)?.scheduleRepairs.get(value.scheduleId)
    // Interval occurrences repeat the anchor slot at other times. If there is one repair,
    // matching its old amount identifies the slot: equal incompatible slots all require repair.
    const repair =
      slots?.get(formatTime(value.dueAt)) ??
      (slots?.size === 1 ? slots.values().next().value : undefined)
    return {
      ...value,
      quantity: repaired(value.quantity, repair),
      ...('record' in value ? { record: record(value.record) } : {}),
    } as DoseOccurrence
  }
  if (isHistoryKey(key)) return (data as DoseOccurrence[]).map(occurrence) as T
  if (isUnscheduledKey(key))
    return (data as UnscheduledDose[]).map((value) => dose(value, `unscheduled:${value.id}`)) as T
  if (key[1] !== scheduleKeys.snapshot()[1]) return data
  const snapshot = data as unknown as ScheduleSnapshot
  return {
    ...snapshot,
    schedules: snapshot.schedules.map(schedule),
    records: snapshot.records.map(record),
  } as T
}

/** Both confirmation paths cancel older reads before publishing. Dose history aggregates are
 * server-owned, so reset the affected pages and reconcile instead of displaying stale totals.
 */
export async function confirmTypeCorrection(
  client: QueryClient,
  medicine: MedicineRecord,
  command: Pick<TypeCorrection, 'repairs'>,
  review: TypeCorrectionReview,
  active: () => boolean,
) {
  const historyKey = doseHistoryKeys.medicine(medicine.id)
  await Promise.all([
    client.cancelQueries({ queryKey: medicineKeys.all }),
    client.cancelQueries({ queryKey: scheduleKeys.all }),
    client.cancelQueries({ queryKey: historyKey }),
  ])
  if (!active() || !sessionSaves(client).active) return

  let confirmed = corrections.get(client)
  if (!confirmed) {
    confirmed = new Map()
    corrections.set(client, confirmed)
    sessionSaves(client).onEnd(() => corrections.delete(client))
  }
  const previous = confirmed.get(medicine.id)
  if (previous && previous.medicine.revision > medicine.revision) return
  const repairs = new Map(previous?.repairs)
  const scheduleRepairs = new Map(previous?.scheduleRepairs)
  const submitted = new Map(command.repairs.map(({ key, quantity }) => [key, quantity]))
  function repair(before: number, quantity: number, previous?: Repair): Repair {
    return { previous: new Set([...(previous?.previous ?? []), before]), quantity }
  }
  for (const conflict of review.conflicts) {
    const quantity = submitted.get(conflict.key)
    if (quantity === undefined) continue
    if (conflict.kind === 'schedule') {
      const slots = scheduleRepairs.get(conflict.version.id) ?? new Map<string, Repair>()
      slots.set(conflict.time, repair(conflict.quantity, quantity, slots.get(conflict.time)))
      scheduleRepairs.set(conflict.version.id, slots)
    } else repairs.set(conflict.key, repair(conflict.quantity, quantity, repairs.get(conflict.key)))
  }
  confirmed.set(medicine.id, { medicine, repairs, scheduleRepairs })

  notifyManager.batch(() => {
    client.setQueryData<Medicine[]>(medicineKeys.list(), (list) =>
      mergeClientMedicines(client, list, [medicine]),
    )
    for (const query of client.getQueryCache().findAll({ queryKey: scheduleKeys.all })) {
      const data = query.state.data
      if (data)
        query.setState({ data: applyConfirmedTypeCorrections(client, query.queryKey, data) })
    }
    void client.resetQueries({ queryKey: historyKey })
  })
  void client.invalidateQueries({ queryKey: scheduleKeys.all })
  void client.invalidateQueries({ queryKey: medicineKeys.all })
}
