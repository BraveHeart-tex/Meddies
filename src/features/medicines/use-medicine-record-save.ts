'use client'

import { useEffect, useRef, useSyncExternalStore } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { requestSave, sessionSaves } from '@/lib/session-saves'
import { discardSessionFormDraft } from '@/lib/session-drafts'
import { parseMedicineRecord, type MedicineRecord } from './contract'
import { scheduleKeys } from '../schedules/queries'
import { confirmDetailCorrection } from './confirm-detail-correction'
import { confirmMedicine, medicinesQuery } from './queries'
import { medicationRecordHref } from './routes'

export const medicineRecordKey = (id: string, mode: string, period: string) =>
  `medicine:${id}:${mode}:${mode === 'strength' ? '-' : period}`

/** Session-owned edits: identical retries retain action identity, including after navigation.
 * Only a receipt bearing this action and its resulting period can confirm a write. Loaded dose
 * facts stay untouched until their own authoritative reads reconcile.
 */
export function useMedicineRecordSave(
  medicine: MedicineRecord,
  mode: 'fix' | 'strength',
  periodId: string,
  onSaved: (medicine: MedicineRecord) => void,
) {
  const client = useQueryClient()
  const store = sessionSaves(client)
  const key = medicineRecordKey(medicine.id, mode, periodId)
  useSyncExternalStore(store.subscribe, store.snapshot, store.snapshot)
  const attempt = store.entries.get(key)
  const handled = useRef<unknown>(undefined)
  useEffect(() => store.observe(key), [store, key])
  useEffect(() => {
    if (!store.active || !attempt?.result?.saved || handled.current === attempt) return
    handled.current = attempt
    onSaved(parseMedicineRecord(attempt.result.saved))
    store.clear(key)
  }, [attempt, key, onSaved, store])
  return {
    key,
    pending: attempt?.status === 'pending',
    problem: attempt?.result?.problem,
    clear: () => store.clear(key),
    async review() {
      await client.fetchQuery({ ...medicinesQuery(client), staleTime: 0 })
      discardSessionFormDraft(client, key)
      store.clear(key)
    },
    submit: (values: Record<string, unknown>) =>
      store.submit(
        key,
        {
          payload: { medicineId: medicine.id, expectedRevision: medicine.revision, ...values },
          label: medicine.label,
          kind: 'medicine',
          href: medicationRecordHref(medicine.id, mode, periodId),
          openHref: medicationRecordHref(medicine.id),
          savedTitle: mode === 'fix' ? 'Fixed details saved' : 'Strength change saved',
        },
        async (payload, active) => {
          const input: Record<string, unknown> = { ...payload, actionId: payload.id }
          const operation = mode === 'fix' ? 'correctDetails' : 'changeStrength'
          const body = { operation, [mode === 'fix' ? 'correction' : 'change']: input }
          function match(value: unknown) {
            const saved = parseMedicineRecord(value)
            const period = saved.strengthRevisions.find(
              (r) => r.id === (mode === 'fix' ? periodId : input.actionId),
            )
            if (
              saved.id !== medicine.id ||
              saved.lastActionId !== input.actionId ||
              saved.revision !== (input.expectedRevision as number) + 1 ||
              !period ||
              period.strength !== input.strength ||
              (mode === 'fix' && (period.label !== input.label || period.unit !== input.unit)) ||
              (mode === 'strength' && period.effectiveAt !== input.effectiveAt)
            )
              throw new Error('Medicine edit receipt does not match attempt')
            return saved
          }
          let result = await requestSave(
            '/api/medicines',
            body,
            (data) => {
              const envelope = data as { medicines?: unknown[] }
              return match(
                envelope.medicines?.find((value) => (value as { id?: string }).id === medicine.id),
              )
            },
            'PATCH',
          )
          if (result.problem === 'rejected' && active()) {
            try {
              await client.fetchQuery({ ...medicinesQuery(client), staleTime: 0 })
            } catch {
              /* The entered details remain available even when the bound read fails. */
            }
          }
          if (result.problem === 'unconfirmed' && active()) {
            try {
              const list = await client.fetchQuery({ ...medicinesQuery(client), staleTime: 0 })
              result = { saved: match(list.find((item) => item.id === medicine.id)) }
            } catch {
              /* Only the same action confirms an unknown receipt. */
            }
          }
          if (result.saved && active()) {
            if (mode === 'fix')
              await confirmDetailCorrection(client, result.saved, periodId, active)
            await confirmMedicine(client, result.saved, active)
            if (active()) void client.invalidateQueries({ queryKey: scheduleKeys.all })
            if (active()) discardSessionFormDraft(client, key)
          }
          return result
        },
      ),
  }
}
