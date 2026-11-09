'use client'

import { useEffect, useRef, useSyncExternalStore } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { sessionSaves, requestSave } from '@/lib/session-saves'
import { discardSessionFormDraft } from '@/lib/session-drafts'
import { parseMedicine, type Medicine } from './contract'
import { medicineAddKey, type MedicineFormOutput } from './medicine-form-schema'
import { confirmMedicine, medicinesQuery } from './queries'
import { medicationsHref } from './routes'

function matchingMedicine(value: unknown, attempted: Medicine): Medicine {
  const saved = parseMedicine(value)
  if (
    saved.id !== attempted.id ||
    saved.label !== attempted.label ||
    saved.strength !== attempted.strength ||
    saved.unit !== attempted.unit
  )
    throw new Error('Medicine confirmation does not match attempt')
  return saved
}

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
    onSaved(parseMedicine(attempt.result.saved))
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
          let result = await requestSave('/api/medicines', payload, (data) => {
            const envelope = data as { medicines?: unknown[] } | null
            return matchingMedicine(envelope?.medicines?.[0], attempted)
          })
          if (result.problem === 'unconfirmed' && active()) {
            try {
              const list = await client.fetchQuery({ ...medicinesQuery(), staleTime: 0 })
              const saved = matchingMedicine(
                list.find((item) => item.id === attempted.id),
                attempted,
              )
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
