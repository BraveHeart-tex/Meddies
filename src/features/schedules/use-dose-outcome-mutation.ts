'use client'

import { useRef, useState } from 'react'
import { parseDoseOutcomeRecord, type DoseOccurrence, type DoseOutcomeRecord } from './contract'
import { matchesDoseReceipt, type DoseAttempt } from './dose-receipt'

export type PendingDose = {
  id: string
  outcome: DoseOutcomeRecord['outcome']
  unconfirmed?: boolean
}
type Outcome = DoseOutcomeRecord['outcome']
type PinnedCorrection = { outcome: Outcome; revision: number }

/** A fresh cache-backed check found a record, no record, or failed. */
export type RecordCheck = { record: DoseOutcomeRecord } | 'missing' | 'unknown'
export type SaveProblem =
  { kind: 'rejected' | 'unauthorized' } | { kind: 'uncertain'; checked: boolean }

/** Owns one mounted drawer's save, exact retry and bounded receipt check. Lifetime: FE-674. */
export function useDoseOutcomeMutation({
  dose,
  refresh,
  onRecorded,
  onFinished,
  checkRecorded,
  onPending,
}: {
  dose: DoseOccurrence
  onPending?: (attempt: PendingDose, clear?: boolean) => void
  refresh: () => Promise<boolean>
  checkRecorded?: () => Promise<RecordCheck>
  onRecorded: (record: DoseOutcomeRecord) => void
  onFinished: () => void
}) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [needsReview, setNeedsReview] = useState(false)
  const [problem, setProblem] = useState<SaveProblem | null>(null)
  const locked = useRef(false)
  const retryAction = useRef<DoseAttempt | null>(null)
  const pinnedCorrection = useRef<PinnedCorrection | null>(null)

  function discardAttempt() {
    const attempt = retryAction.current
    if (attempt) onPending?.({ id: attempt.id, outcome: attempt.payload.outcome }, true)
    retryAction.current = null
    pinnedCorrection.current = null
  }

  function closeAfterConflict(message: string) {
    discardAttempt()
    onFinished()
    setError(message)
    setNeedsReview(true)
  }

  async function submit(outcome: Outcome, details: Record<string, unknown>) {
    if (locked.current || needsReview) return
    locked.current = true
    setSaving(true)
    setError('')
    setProblem(null)
    const correction = pinnedCorrection.current
    const fingerprint = JSON.stringify({ outcome, details, dose: dose.id, correction })
    if (!retryAction.current || retryAction.current.fingerprint !== fingerprint) {
      discardPending()
      const id = crypto.randomUUID()
      retryAction.current = {
        id,
        fingerprint,
        method: correction ? 'PATCH' : 'PUT',
        payload: {
          ...details,
          outcome,
          scheduleId: dose.scheduleId,
          dueAt: dose.dueAt,
          ...(correction
            ? {
                actionId: id,
                expectedRevision: correction.revision,
                expectedOutcome: correction.outcome,
              }
            : {}),
        },
      }
    }
    const attempt = retryAction.current
    const pending = { id: attempt.id, outcome }
    onPending?.(pending)

    function clearPending() {
      onPending?.(pending, true)
    }
    function confirm(record: DoseOutcomeRecord) {
      clearPending()
      onRecorded(record)
      // A receipt completes only the attempt whose response/check it belongs to.
      if (retryAction.current?.id === attempt.id) {
        retryAction.current = null
        pinnedCorrection.current = null
        onFinished()
      }
    }
    try {
      const response = await fetch('/api/schedules', {
        method: attempt.method,
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(12000),
        body: JSON.stringify(attempt.payload),
      })
      if (response.status === 400) {
        clearPending()
        setProblem({ kind: 'rejected' })
        setError(
          outcome === 'Taken'
            ? 'Not saved. Taken time must be a time that has already passed. Change the time and save again.'
            : 'This scheduled dose can no longer be skipped. Refresh Today to check its status.',
        )
      } else if (response.status === 401) {
        clearPending()
        setProblem({ kind: 'unauthorized' })
        setError('Your session ended. Sign in again to record this dose.')
      } else if (response.status === 409) {
        clearPending()
        await refresh().catch(() => false)
        closeAfterConflict(
          correction
            ? 'This dose changed elsewhere. Your correction was not saved. Review its current outcome before correcting it again.'
            : 'An outcome already exists for this dose. Review its current outcome.',
        )
      } else if (response.ok) {
        const body = await response.json()
        const record = parseDoseOutcomeRecord(body.record)
        if (!matchesDoseReceipt(record, attempt)) throw new Error('acknowledgment')
        confirm(record)
      } else {
        throw new Error('uncertain')
      }
    } catch {
      const check: RecordCheck =
        checkRecorded && navigator.onLine
          ? await checkRecorded().catch((): RecordCheck => 'unknown')
          : 'unknown'
      const found = typeof check === 'object' ? check.record : null
      if (found && matchesDoseReceipt(found, attempt)) {
        confirm(found)
      } else if (found && (!correction || (found.revision ?? 0) !== correction.revision)) {
        // Current outcome is known; receipt of this attempt is still unknown. Keep its details.
        clearPending()
        setProblem({ kind: 'uncertain', checked: false })
        setError('This dose has changed. Review its current outcome')
        setNeedsReview(true)
      } else {
        onPending?.({ ...pending, unconfirmed: true })
        setError('Save could not be confirmed. Connect and retry with the same details.')
        setProblem({ kind: 'uncertain', checked: check === 'missing' })
      }
    } finally {
      locked.current = false
      setSaving(false)
    }
  }

  function discardPending() {
    const previous = retryAction.current
    if (previous) onPending?.({ id: previous.id, outcome: previous.payload.outcome }, true)
  }

  return {
    submit,
    saving,
    error,
    needsReview,
    problem,
    clearFeedback() {
      if (needsReview && problem?.kind === 'uncertain') return
      setError('')
      setProblem(null)
      setNeedsReview(false)
    },
    clearError() {
      if (needsReview && problem?.kind === 'uncertain') return
      setError('')
      setProblem(null)
    },
    dismissReview() {
      setNeedsReview(false)
    },
    /** Explicit review ends recovery only after the user has seen the current outcome. */
    reviewCurrent() {
      discardAttempt()
      setNeedsReview(false)
      setError('')
      setProblem(null)
      onFinished()
    },
    pinCorrection(correction: PinnedCorrection | null) {
      pinnedCorrection.current = correction
    },
    resetRetry() {
      discardPending()
      retryAction.current = null
    },
  }
}
