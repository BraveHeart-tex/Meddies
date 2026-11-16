import type { QueryClient } from '@tanstack/react-query'
import { sessionSaves } from '@/lib/session-saves'
import { istanbulDate } from '../schedules/contract'
import { scheduleKeys, type ScheduleSnapshot } from '../schedules/queries'
import type { MedicineRecord } from './contract'
import { medicineKeys, mergeClientMedicines } from './queries'

/** #327: publishes a matching archive receipt, never a rejected or Unconfirmed attempt. After
 * cancelling older reads, the Medicine carries `archivedAt` and its head Schedule version gets the
 * stop successor the server wrote at the Edit time (same ID: the action ID), so Medications, Today
 * and future-dose views drop it at once. The stop is marked `archiveStop`, so a later restore reads
 * "No schedule" (#328). Merges keep both, so late reads and hydration cannot
 * return it to active or future-dose views; fresh reads then reconcile.
 */
export async function confirmMedicineArchive(
  client: QueryClient,
  medicine: MedicineRecord,
  active = () => true,
) {
  await Promise.all([
    client.cancelQueries({ queryKey: medicineKeys.all }),
    client.cancelQueries({ queryKey: scheduleKeys.all }),
  ])
  if (!active() || !sessionSaves(client).active || !medicine.archivedAt || !medicine.lastActionId)
    return
  const archivedAt = medicine.archivedAt
  const stopId = medicine.lastActionId
  client.setQueryData<MedicineRecord[]>(
    medicineKeys.list(),
    (list) => mergeClientMedicines(client, list, [medicine]) as MedicineRecord[],
  )
  client.setQueryData<ScheduleSnapshot>(scheduleKeys.snapshot(), (snapshot) => {
    if (!snapshot) return snapshot
    const editDay = istanbulDate(new Date(archivedAt))
    // Like the server: the current head stops unless it is already stopped or Ended.
    const head = snapshot.schedules.find(
      (item) =>
        item.medicineId === medicine.id &&
        item.id !== stopId &&
        !item.stoppedAt &&
        (!item.endDate || item.endDate >= editDay) &&
        !snapshot.schedules.some((next) => next.basedOnId === item.id),
    )
    if (!head) return snapshot
    return {
      ...snapshot,
      schedules: [
        ...snapshot.schedules.map((item) =>
          item.id === head.id ? { ...item, replacedAt: archivedAt } : item,
        ),
        {
          ...head,
          id: stopId,
          basedOnId: head.id,
          confirmedAt: archivedAt,
          stoppedAt: archivedAt,
          pausedAt: null,
          endDate: null,
          replacedAt: null,
          archiveStop: true,
        },
      ],
    }
  })
  void client.invalidateQueries({ queryKey: medicineKeys.all })
  void client.invalidateQueries({ queryKey: scheduleKeys.all })
}

/** #328: publishes a matching restore receipt only. After cancelling older reads the Medicine,
 * at revision + 1 without `archivedAt`, returns to Medications and leaves Archived medications;
 * revision merges keep a delayed archived read from undoing it. Restore changes no Schedule
 * version: the archive's stop version stays the head, so it reads "No schedule".
 */
export async function confirmMedicineRestore(
  client: QueryClient,
  medicine: MedicineRecord,
  active = () => true,
) {
  await Promise.all([
    client.cancelQueries({ queryKey: medicineKeys.all }),
    client.cancelQueries({ queryKey: scheduleKeys.all }),
  ])
  if (!active() || !sessionSaves(client).active || medicine.archivedAt) return
  client.setQueryData<MedicineRecord[]>(
    medicineKeys.list(),
    (list) => mergeClientMedicines(client, list, [medicine]) as MedicineRecord[],
  )
  void client.invalidateQueries({ queryKey: medicineKeys.all })
  void client.invalidateQueries({ queryKey: scheduleKeys.all })
}
