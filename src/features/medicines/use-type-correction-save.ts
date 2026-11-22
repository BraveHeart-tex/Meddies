'use client'

import { useQueryClient } from '@tanstack/react-query'
import { requestSave } from '@/lib/session-saves'
import { discardSessionFormDraft } from '@/lib/session-drafts'
import { useSessionSave } from '@/lib/use-session-save'
import { parseMedicineRecord, type MedicineRecord } from './contract'
import { fetchMedicines, medicineKeys, medicinesQuery } from './queries'
import { medicationRecordHref } from './routes'
import { medicineRecordKey } from './use-medicine-record-save'
import type { TypeCorrection, TypeCorrectionReview } from './type-correction-contract'

type CorrectionDraft = {
  command: Omit<TypeCorrection, 'actionId'>
  medicine: MedicineRecord
  review: TypeCorrectionReview
}

/** The reviewed facts travel with the session attempt so returning to Edit details can
 * reconstruct final review and retry even if saved facts have changed in the meantime.
 */
export function useTypeCorrectionSave(medicine: MedicineRecord, periodId: string) {
  const client = useQueryClient()
  const key = `medicine:${medicine.id}:type-correction:${periodId}`
  const { store, attempt, pending, problem } = useSessionSave<MedicineRecord>(key)
  const submitted = attempt?.payload as (CorrectionDraft & { id: string }) | undefined

  function submit({ medicine, review, command }: CorrectionDraft) {
    return store.submit(
      key,
      {
        payload: { medicine, review, command },
        kind: 'medicine',
        label: medicine.label,
        href: medicationRecordHref(medicine.id, 'fix', periodId),
        openHref: medicationRecordHref(medicine.id),
        savedTitle: 'Details saved',
      },
      async (payload, active) => {
        const { command, id } = payload as CorrectionDraft & { id: string }
        function match(value: unknown) {
          const saved = parseMedicineRecord(value)
          if (
            saved.id !== command.medicineId ||
            saved.lastActionId !== id ||
            saved.revision !== command.expectedRevision + 1
          )
            throw new Error('Type correction receipt does not match attempt')
          return saved
        }
        let result = await requestSave(
          '/api/medicines/type-correction',
          { ...command, actionId: id },
          (data) =>
            match(
              (data as { medicines?: { id: string }[] }).medicines?.find(
                ({ id }) => id === command.medicineId,
              ),
            ),
          'PATCH',
        )
        if (result.problem === 'unconfirmed' && active()) {
          try {
            // This read proves the attempt without publishing any affected Query cache.
            const list = await fetchMedicines()
            result = { saved: match(list.find(({ id }) => id === command.medicineId)) }
          } catch {
            // Only the expected successor bearing this action ID confirms the attempt.
          }
        }
        if (result.saved && active())
          discardSessionFormDraft(client, medicineRecordKey(command.medicineId, 'fix', periodId))
        return result
      },
    )
  }

  return {
    submitted,
    pending,
    problem,
    confirmed: Boolean(attempt?.result?.saved),
    submit,
    retry: () => submitted && submit(submitted),
    clear: () => store.clear(key),
    async readSaved() {
      await client.cancelQueries({ queryKey: medicineKeys.list(), exact: true })
      const list = await client.fetchQuery({ ...medicinesQuery(client), staleTime: 0 })
      return parseMedicineRecord(list.find(({ id }) => id === medicine.id))
    },
  }
}
