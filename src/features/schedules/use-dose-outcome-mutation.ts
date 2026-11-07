'use client'

import { useRef, useState } from 'react'
import { parseDoseOutcomeRecord, type DoseOccurrence, type DoseOutcomeRecord } from './contract'

type Outcome = DoseOutcomeRecord['outcome']
type PinnedCorrection = { outcome: 'Taken' | 'Skipped'; revision: number }

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
}: {
  dose: DoseOccurrence
  refresh: () => Promise<boolean>
  onRecorded: (record: DoseOutcomeRecord) => void
  onFinished: () => void
}) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [needsReview, setNeedsReview] = useState(false)
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
    const retry =
      outcome === 'Taken'
        ? 'Save could not be confirmed. Connect and retry with the same details.'
        : 'Save could not be confirmed. Retry with the same scheduled dose or refresh Today.'
    try {
      const correctingExisting =
        pinnedCorrection.current !== null && (dose.status === 'Taken' || dose.status === 'Skipped')
      const currentRevision = pinnedCorrection.current?.revision ?? 0
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
        setError(
          outcome === 'Taken'
            ? 'Check the quantity and enter a time that has already passed.'
            : 'This scheduled dose can no longer be skipped. Refresh Today to check its status.',
        )
      } else if (response.status === 401) {
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
        setError(retry)
      }
    } catch {
      setError(retry)
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
    /** Clears the error and the review prompt. */
    clearFeedback() {
      setError('')
      setNeedsReview(false)
    },
    /** Clears the error only, keeping the review prompt. */
    clearError() {
      setError('')
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
