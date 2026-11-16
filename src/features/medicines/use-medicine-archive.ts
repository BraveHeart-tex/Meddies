'use client'

import { useEffect, useRef, useSyncExternalStore } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { requestSave, sessionSaves } from '@/lib/session-saves'
import { parseMedicineRecord, type Medicine } from './contract'
import { confirmMedicineArchive, confirmMedicineRestore } from './confirm-medicine-archive'
import { medicinesQuery } from './queries'
import { medicationRecordHref } from './routes'

export type MedicineArchiveAction = 'archive' | 'restore'

/** Session-owned archive (#327) or restore (#328): only a record bearing this action, revision + 1
 * and `archivedAt` set (archive) or cleared (restore) confirms it. Navigation hides the observer;
 * the shared feedback host takes over without cancelling the save.
 */
export function useMedicineArchive(
  medicine: Medicine,
  open: boolean,
  onSaved: () => void,
  action: MedicineArchiveAction = 'archive',
) {
  const client = useQueryClient()
  const store = sessionSaves(client)
  const key = `medicine:${medicine.id}:${action}`
  useSyncExternalStore(store.subscribe, store.snapshot, store.snapshot)
  const attempt = store.entries.get(key)
  const handled = useRef<unknown>(undefined)
  useEffect(() => {
    if (open) return store.observe(key)
  }, [store, key, open])
  useEffect(() => {
    if (!open || !store.active || !attempt?.result?.saved || handled.current === attempt) return
    handled.current = attempt
    onSaved()
    store.clear(key)
  }, [attempt, key, onSaved, open, store])
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
          savedTitle: `${medicine.label} ${action === 'archive' ? 'archived' : 'restored'}`,
        },
        async (payload, active) => {
          const edit = {
            actionId: payload.id,
            medicineId: payload.medicineId,
            expectedRevision: payload.expectedRevision,
          }
          function match(value: unknown) {
            const saved = parseMedicineRecord(value)
            if (
              saved.id !== edit.medicineId ||
              saved.lastActionId !== edit.actionId ||
              saved.revision !== (edit.expectedRevision as number) + 1 ||
              Boolean(saved.archivedAt) !== (action === 'archive')
            )
              throw new Error(`Medicine ${action} receipt does not match attempt`)
            return saved
          }
          let result = await requestSave(
            '/api/medicines',
            { operation: action, [action]: edit },
            (data) =>
              match(
                (data as { medicines?: unknown[] }).medicines?.find(
                  (value) => (value as { id?: string }).id === edit.medicineId,
                ),
              ),
            'PATCH',
          )
          if (result.problem === 'unconfirmed' && active()) {
            try {
              const list = await client.fetchQuery({ ...medicinesQuery(client), staleTime: 0 })
              result = { saved: match(list.find((item) => item.id === edit.medicineId)) }
            } catch {
              /* Only the same action confirms an unknown receipt. */
            }
          }
          if (result.saved && active())
            await (action === 'archive' ? confirmMedicineArchive : confirmMedicineRestore)(
              client,
              result.saved,
              active,
            )
          return result
        },
      ),
  }
}
