import type { DoseOutcomeRecord } from './contract'

/** A local identity for both initial recording and corrections, with the exact submitted body. */
export type DoseAttempt = {
  id: string
  fingerprint: string
  method: 'PUT' | 'PATCH'
  payload: Readonly<
    Record<string, unknown> & {
      scheduleId: string
      dueAt: string
      outcome: DoseOutcomeRecord['outcome']
    }
  >
}

/** Receipt evidence is stricter than a matching outcome, including on a successful HTTP reply. */
export function matchesDoseReceipt(record: DoseOutcomeRecord, attempt: DoseAttempt) {
  const { payload, method, id } = attempt
  return (
    record.scheduleId === payload.scheduleId &&
    record.dueAt === payload.dueAt &&
    record.outcome === payload.outcome &&
    (method === 'PATCH'
      ? record.revision === Number(payload.expectedRevision) + 1 && record.actionId === id
      : (record.revision ?? 0) === 0) &&
    (record.outcome !== 'Taken' ||
      (record.takenAt === payload.takenAt && record.quantity === payload.quantity))
  )
}
