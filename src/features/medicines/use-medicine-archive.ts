'use client'

import { useEffect, useRef, useSyncExternalStore } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { requestSave, sessionSaves } from '@/lib/session-saves'
import { parseMedicineRecord, type Medicine } from './contract'
import { confirmMedicineArchive } from './confirm-medicine-archive'
import { medicinesQuery } from './queries'
import { medicationRecordHref } from './routes'

/** Session-owned archive (#327): only a record bearing this action, revision + 1 and `archivedAt`
 * confirms it. Navigation hides the observer; the shared feedback host takes over without
 * cancelling the save.
 */
export function useMedicineArchive(medicine: Medicine, open: boolean, onArchived: () => void) {
  const client = useQueryClient()
  const store = sessionSaves(client)
  const key = `medicine:${medicine.id}:archive`
  useSyncExternalStore(store.subscribe, store.snapshot, store.snapshot)
  const attempt = store.entries.get(key)
  const handled = useRef<unknown>(undefined)
  useEffect(() => {
    if (open) return store.observe(key)
  }, [store, key, open])
  useEffect(() => {
    if (!open || !store.active || !attempt?.result?.saved || handled.current === attempt) return
    handled.current = attempt
    onArchived()
    store.clear(key)
  }, [attempt, key, onArchived, open, store])
  return {
    pending: attempt?.status === 'pending',
    problem: attempt?.result?.problem,
    clear: () => store.clear(key),
    async review() {
      await client.fetchQuery({ ...medicinesQuery(client), staleTime: 0 })
      store.clear(key)
    },
    submit: () =>
      store.submit(
        key,
        {
          payload: {
            medicineId: medicine.id,
            // A newer read after navigation must not silently rebase an Unconfirmed save.
            expectedRevision:
              attempt?.result?.problem === 'unconfirmed'
                ? attempt.payload.expectedRevision
                : medicine.revision,
          },
          label: medicine.label,
          kind: 'medicine',
          href: medicationRecordHref(medicine.id),
          openHref: medicationRecordHref(medicine.id),
          savedTitle: `${medicine.label} archived`,
        },
        async (payload, active) => {
          const archive = {
            actionId: payload.id,
            medicineId: payload.medicineId,
            expectedRevision: payload.expectedRevision,
          }
          function match(value: unknown) {
            const saved = parseMedicineRecord(value)
            if (
              saved.id !== archive.medicineId ||
              saved.lastActionId !== archive.actionId ||
              saved.revision !== (archive.expectedRevision as number) + 1 ||
              !saved.archivedAt
            )
              throw new Error('Medicine archive receipt does not match attempt')
            return saved
          }
          let result = await requestSave(
            '/api/medicines',
            { operation: 'archive', archive },
            (data) =>
              match(
                (data as { medicines?: unknown[] }).medicines?.find(
                  (value) => (value as { id?: string }).id === archive.medicineId,
                ),
              ),
            'PATCH',
          )
          if (result.problem === 'unconfirmed' && active()) {
            try {
              const list = await client.fetchQuery({ ...medicinesQuery(client), staleTime: 0 })
              result = { saved: match(list.find((item) => item.id === archive.medicineId)) }
            } catch {
              /* Only the same action confirms an unknown receipt. */
            }
          }
          if (result.saved && active()) await confirmMedicineArchive(client, result.saved, active)
          return result
        },
      ),
  }
}
