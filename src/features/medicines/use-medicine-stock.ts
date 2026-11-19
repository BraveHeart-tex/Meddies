'use client'

import { useEffect, useRef, useSyncExternalStore } from 'react'
import { useQueryClient, type QueryClient } from '@tanstack/react-query'
import { requestSave, sessionSaves } from '@/lib/session-saves'
import { parseMedicineRecord, type Medicine, type MedicineRecord } from './contract'
import { medicineKeys, medicinesQuery, mergeClientMedicines } from './queries'
import { medicationRecordHref } from './routes'

export type MedicineStockAction = 'stockOn' | 'stockOff'

/** #393: publishes a matching stock receipt only. After cancelling older reads the Medicine, at
 * revision + 1 with the new stock, replaces the cached one; revision merges keep a delayed read
 * from showing the old count.
 */
export async function confirmMedicineStock(
  client: QueryClient,
  medicine: MedicineRecord,
  active = () => true,
) {
  await client.cancelQueries({ queryKey: medicineKeys.all })
  if (!active() || !sessionSaves(client).active) return
  client.setQueryData<Medicine[]>(medicineKeys.list(), (list) =>
    mergeClientMedicines(client, list, [medicine]),
  )
  void client.invalidateQueries({ queryKey: medicineKeys.all })
}

/** Session-owned stock on or off (#393), shaped like the archive save (#327): only a record
 * bearing this action, revision + 1 and the requested stock confirms it, so the count shows only
 * once the server has it. A retry after Unconfirmed reuses the action ID and payload; a changed
 * starting count is a new attempt. Navigation hides the observer; the shared feedback host takes
 * over without cancelling the save.
 */
export function useMedicineStock(
  medicine: Medicine,
  action: MedicineStockAction,
  open: boolean,
  onSaved: () => void,
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
    submit: (startingCount?: number) =>
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
            ...(action === 'stockOn' && { unit: medicine.unit, startingCount }),
          },
          label: medicine.label,
          kind: 'medicine',
          href: medicationRecordHref(medicine.id),
          openHref: medicationRecordHref(medicine.id),
          savedTitle:
            action === 'stockOn'
              ? `Tracking ${medicine.label} stock`
              : `Stopped tracking ${medicine.label} stock`,
        },
        async (payload, active) => {
          const { id, ...rest } = payload
          const edit = { actionId: id as string, ...rest } as {
            actionId: string
            medicineId: string
            expectedRevision: number
            startingCount?: number
          }
          function match(value: unknown) {
            const saved = parseMedicineRecord(value)
            if (
              saved.id !== edit.medicineId ||
              saved.lastActionId !== edit.actionId ||
              saved.revision !== edit.expectedRevision + 1 ||
              (action === 'stockOn'
                ? !saved.stock.tracked || saved.stock.count !== edit.startingCount
                : saved.stock.tracked)
            )
              throw new Error('Medicine stock receipt does not match attempt')
            return saved
          }
          let result = await requestSave(
            '/api/medicines',
            { operation: action, stock: edit },
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
          if (result.saved && active()) await confirmMedicineStock(client, result.saved, active)
          return result
        },
      ),
  }
}
