import type { DoseUnit } from '@/lib/dose-quantity'
import type { DoseOccurrence, DoseOutcomeRecord } from './contract'
import type { DoseAttempt } from './dose-receipt'

type Outcome = DoseOutcomeRecord['outcome']
export type PinnedCorrection = Readonly<{ outcome: Outcome; revision: number }>
/** A fresh cache-backed check found a record, no record, or failed. */
export type RecordCheck = { record: DoseOutcomeRecord } | 'missing' | 'unknown'
export type SaveProblem = { kind: 'rejected' } | { kind: 'uncertain'; checked: boolean }
/** What a dose row shows while its save is pending or unconfirmed. */
export type PendingDose = { id: string; outcome: Outcome; unconfirmed?: boolean }
/** Raw Taken form values at submit and the Now minute they used, to reopen the attempt. */
export type AttemptForm = Readonly<{ values: unknown; now: string }>

/** One occurrence's save, owned by the session so leaving Today or closing the drawer keeps it. */
export type DoseSave = {
  doseId: string
  /** The exact request a retry resends; null once the attempt is discarded. */
  attempt: Readonly<DoseAttempt> | null
  correction: PinnedCorrection | null
  form?: AttemptForm
  medicine: Readonly<{ label: string; unit: DoseUnit }>
  /** Istanbul today, read when needed, to name where the dose lives after a day rolls over. */
  today: () => string
  pending: boolean
  problem: SaveProblem | null
  error: string
  needsReview: boolean
}

export type DoseCommand =
  { outcome: 'Taken'; takenAt: string; quantity: number } | { outcome: 'Skipped' }

export type DoseSaveRequest = {
  dose: DoseOccurrence
  command: DoseCommand
  correction: PinnedCorrection | null
  form?: AttemptForm
  medicine: DoseSave['medicine']
  today: () => string
  /** Presentation only; persistence never depends on this callback. */
  onRecorded?: (record: DoseOutcomeRecord, superseded: boolean) => void
}
