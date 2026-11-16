'use client'

import { useEffect, useRef, useSyncExternalStore } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { requestSave, sessionSaves } from '@/lib/session-saves'
import { parseMedicineDeleteReceipt, type Medicine } from './contract'
import { confirmMedicineDeletion, medicinesQuery } from './queries'
import { medicationRecordHref } from './routes'

/** Session-owned deletion: only the same action's receipt confirms it, never list absence.
 * Navigation hides the observer; the shared feedback host takes over without cancelling saves.
 */
export function useMedicineDelete(medicine: Medicine, open: boolean, onDeleted: () => void) {
  const client = useQueryClient()
  const store = sessionSaves(client)
  const key = `medicine:${medicine.id}:delete`
  useSyncExternalStore(store.subscribe, store.snapshot, store.snapshot)
  const attempt = store.entries.get(key)
  const handled = useRef<unknown>(undefined)
  useEffect(() => {
    if (open) return store.observe(key)
  }, [store, key, open])
  useEffect(() => {
    if (!open || !store.active || !attempt?.result?.saved || handled.current === attempt) return
    handled.current = attempt
    onDeleted()
    store.clear(key)
  }, [attempt, key, onDeleted, open, store])
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
          openHref: '/medications',
          savedTitle: `${medicine.label} deleted`,
        },
        async (payload, active) => {
          const deletion = {
            actionId: payload.id,
            medicineId: payload.medicineId,
            expectedRevision: payload.expectedRevision,
          }
          const result = await requestSave(
            '/api/medicines',
            { operation: 'delete', deletion },
            (data) => {
              const receipt = parseMedicineDeleteReceipt((data as { deletion?: unknown }).deletion)
              if (
                receipt.actionId !== deletion.actionId ||
                receipt.medicineId !== deletion.medicineId ||
                receipt.expectedRevision !== deletion.expectedRevision
              )
                throw new Error('Medicine deletion receipt does not match attempt')
              return receipt
            },
            'PATCH',
          )
          if (result.saved && active()) await confirmMedicineDeletion(client, medicine.id, active)
          return result
        },
      ),
  }
}
