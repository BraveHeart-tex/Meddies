'use client'

import { useRef, useState } from 'react'
import { parseDoseOutcomeRecord, type DoseOccurrence, type DoseOutcomeRecord } from './contract'

type Outcome = DoseOutcomeRecord['outcome']
type PinnedCorrection = { outcome: 'Taken' | 'Skipped'; revision: number }

/** What a fresh load of Today found for this dose: its record, none, or the load failed. */
export type RecordCheck = { record: DoseOutcomeRecord } | 'missing' | 'unknown'

/**
 * Why the last save was not confirmed, shown inside the drawer (FE-648 F3, F4). An `uncertain`
 * save may have reached the server; `checked` means a fresh load found no record yet.
 */
export type SaveProblem =
  { kind: 'rejected' | 'unauthorized' } | { kind: 'uncertain'; checked: boolean }

/**
 * Owns saving a dose outcome: PUT for a new outcome, PATCH for a pinned correction, acknowledgment
 * checks, error copy, conflict refresh-then-close, the synchronous duplicate-submit lock and the
 * retry action identity. `onFinished` resets the drawer after a save or a conflict.
 */
export function useDoseOutcomeMutation({
  dose,
  refresh,
  onRecorded,
  onFinished,
  checkRecorded,
}: {
  dose: DoseOccurrence
  refresh: () => Promise<boolean>
  /** Reloads Today once after an uncertain save; a record from this save ends it (F4). */
  checkRecorded?: () => Promise<RecordCheck>
  onRecorded: (record: DoseOutcomeRecord) => void
  onFinished: () => void
}) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [needsReview, setNeedsReview] = useState(false)
  const [problem, setProblem] = useState<SaveProblem | null>(null)
  const locked = useRef(false)
  const retryAction = useRef<{ fingerprint: string; id: string } | null>(null)
  const pinnedCorrection = useRef<PinnedCorrection | null>(null)

  function closeAfterConflict(message: string) {
    retryAction.current = null
    pinnedCorrection.current = null
    onFinished()
    setError(message)
    setNeedsReview(true)
  }

  async function submit(outcome: Outcome, details: Record<string, unknown>) {
    if (locked.current) return
    locked.current = true
    setSaving(true)
    setError('')
    setProblem(null)
    const retry =
      outcome === 'Taken'
        ? 'Save could not be confirmed. Connect and retry with the same details.'
        : 'Save could not be confirmed. Retry with the same scheduled dose or refresh Today.'
    const correctingExisting =
      pinnedCorrection.current !== null && (dose.status === 'Taken' || dose.status === 'Skipped')
    const currentRevision = pinnedCorrection.current?.revision ?? 0
    try {
      const expectedOutcome = pinnedCorrection.current?.outcome ?? outcome
      const fingerprint = JSON.stringify({
        outcome,
        details,
        dose: dose.id,
        revision: currentRevision,
      })
      if (!retryAction.current || retryAction.current.fingerprint !== fingerprint)
        retryAction.current = { fingerprint, id: crypto.randomUUID() }
      const payload = correctingExisting
        ? {
            ...details,
            actionId: retryAction.current.id,
            expectedRevision: currentRevision,
            expectedOutcome,
            outcome,
            scheduleId: dose.scheduleId,
            dueAt: dose.dueAt,
          }
        : { ...details, outcome, scheduleId: dose.scheduleId, dueAt: dose.dueAt }
      const response = await fetch('/api/schedules', {
        method: correctingExisting ? 'PATCH' : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(12000),
        body: JSON.stringify(payload),
      })
      if (response.status === 400) {
        setProblem({ kind: 'rejected' })
        setError(
          outcome === 'Taken'
            ? 'Not saved. Taken time must be a time that has already passed. Change the time and save again.'
            : 'This scheduled dose can no longer be skipped. Refresh Today to check its status.',
        )
      } else if (response.status === 401) {
        setProblem({ kind: 'unauthorized' })
        setError('Your session ended. Sign in again to record this dose.')
      } else if (response.status === 409) {
        if (correctingExisting) {
          await refresh()
          closeAfterConflict(
            'This dose changed elsewhere. Your correction was not saved. Review its current outcome before correcting it again.',
          )
        } else {
          const reconciled = await refresh()
          closeAfterConflict(
            reconciled
              ? 'This dose was already recorded. The current outcome is shown.'
              : 'An outcome already exists for this dose. Refresh Today to review it.',
          )
        }
      } else if (response.ok) {
        const body = await response.json()
        const record = parseDoseOutcomeRecord(body.record)
        if (
          record.outcome !== outcome ||
          record.scheduleId !== dose.scheduleId ||
          record.dueAt !== dose.dueAt ||
          (correctingExisting &&
            (record.revision !== currentRevision + 1 ||
              record.actionId !== retryAction.current.id ||
              (outcome === 'Taken' &&
                (record.outcome !== 'Taken' ||
                  record.takenAt !== details.takenAt ||
                  record.quantity !== details.quantity))))
        )
          throw new Error('acknowledgment')
        onRecorded(record)
        retryAction.current = null
        pinnedCorrection.current = null
        onFinished()
      } else {
        throw new Error('uncertain')
      }
    } catch {
      // One check (F4), skipped when known offline. A new outcome landed when a record with this
      // outcome exists; a correction landed when the next revision carries this action id.
      const check: RecordCheck =
        checkRecorded && navigator.onLine
          ? await checkRecorded().catch((): RecordCheck => 'unknown')
          : 'unknown'
      const found = typeof check === 'object' ? check.record : null
      const landed =
        found !== null &&
        found.outcome === outcome &&
        (correctingExisting
          ? found.revision === currentRevision + 1 && found.actionId === retryAction.current?.id
          : true)
      if (found && landed) {
        onRecorded(found)
        retryAction.current = null
        pinnedCorrection.current = null
        onFinished()
      } else if (found && (!correctingExisting || (found.revision ?? 0) !== currentRevision)) {
        // Recorded or changed elsewhere: nothing of this save applies.
        await refresh()
        closeAfterConflict(
          correctingExisting
            ? 'This dose changed elsewhere. Your correction was not saved. Review its current outcome before correcting it again.'
            : 'This dose was already recorded. The current outcome is shown.',
        )
      } else {
        setError(retry)
        setProblem({ kind: 'uncertain', checked: check !== 'unknown' })
      }
    } finally {
      locked.current = false
      setSaving(false)
    }
  }

  return {
    submit,
    saving,
    error,
    needsReview,
    problem,
    /** Clears the error and the review prompt. */
    clearFeedback() {
      setError('')
      setProblem(null)
      setNeedsReview(false)
    },
    /** Clears the error only, keeping the review prompt. */
    clearError() {
      setError('')
      setProblem(null)
    },
    /** Hides the review prompt, keeping the error. */
    dismissReview() {
      setNeedsReview(false)
    },
    /** Pins the outcome and revision a correction expects, or unpins with null. */
    pinCorrection(correction: PinnedCorrection | null) {
      pinnedCorrection.current = correction
    },
    /** Drops the retry action identity so the next submit gets a fresh action id. */
    resetRetry() {
      retryAction.current = null
    },
  }
}
