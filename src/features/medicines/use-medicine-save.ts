'use client'

import { useEffect, useRef, useSyncExternalStore } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { sessionSaves, requestSave } from '@/lib/session-saves'
import { discardSessionFormDraft } from '@/lib/session-drafts'
import { parseMedicine, parseMedicineResponse, type Medicine } from './contract'
import { medicineAddKey, type MedicineFormOutput } from './medicine-form-schema'
import { confirmMedicineResponse, reconcileMedicineSave } from './medicine-save-confirmation'
import { confirmMedicine, medicinesQuery } from './queries'
import { medicationsHref } from './routes'

/** Add owns persistence for the session; the form observes presentation state only. */
export function useMedicineSave(onSaved: (medicine: Medicine) => void) {
  const client = useQueryClient()
  const store = sessionSaves(client)
  useSyncExternalStore(store.subscribe, store.snapshot, store.snapshot)
  const attempt = store.entries.get(medicineAddKey)
  const handled = useRef<unknown>(undefined)
  useEffect(() => store.observe(medicineAddKey), [store])
  useEffect(() => {
    if (!store.active || !attempt?.result?.saved || handled.current === attempt) return
    handled.current = attempt
    onSaved(parseMedicineResponse(attempt.result.saved))
    store.clear(medicineAddKey)
  }, [attempt, onSaved, store])

  return {
    pending: attempt?.status === 'pending',
    problem: attempt?.result?.problem,
    label: attempt?.label ?? '',
    clear: () => store.clear(medicineAddKey),
    submit: (values: MedicineFormOutput) =>
      store.submit(
        medicineAddKey,
        {
          payload: { ...values },
          label: values.label,
          kind: 'medicine',
          href: medicationsHref({ mode: 'add' }),
        },
        async (payload, active) => {
          const attempted = parseMedicine(payload)
          let result = await requestSave('/api/medicines', payload, (data) =>
            confirmMedicineResponse(data, attempted),
          )
          if (result.problem === 'unconfirmed' && active()) {
            try {
              const list = await client.fetchQuery({ ...medicinesQuery(client), staleTime: 0 })
              const saved = reconcileMedicineSave(list, attempted)
              result = { saved }
            } catch {
              // Only an exact saved medicine can resolve an unconfirmed attempt.
            }
          }
          if (result.saved && active()) {
            await confirmMedicine(client, result.saved, active)
            if (active()) discardSessionFormDraft(client, medicineAddKey)
          }
          return result
        },
      ),
  } as const
}
