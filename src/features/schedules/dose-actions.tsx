'use client'

import { useRef, useState } from 'react'
import type { Medicine } from '@/features/medicines/contract'
import { parseDoseOutcomeRecord, type DoseOccurrence, type DoseOutcomeRecord } from './contract'
import { SkippedForm } from './skipped-form'
import { doseClock, TakenForm } from './taken-form'

type Outcome = DoseOutcomeRecord['outcome']

export function DoseActions({
  dose,
  medicine,
  refresh,
  onRecorded,
}: {
  dose: DoseOccurrence
  medicine: Medicine
  refresh: () => Promise<boolean>
  onRecorded: (record: DoseOutcomeRecord) => void
}) {
  const [editor, setEditor] = useState<Outcome | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [correcting, setCorrecting] = useState(false)
  const locked = useRef(false)
  const retryAction = useRef<{ fingerprint: string; id: string } | null>(null)
  const correctionTrigger = useRef<HTMLButtonElement>(null)
  const pinnedCorrection = useRef<{ outcome: 'Taken' | 'Skipped'; revision: number } | null>(null)

  function edit(outcome: Outcome | null) {
    setEditor(outcome)
    setError('')
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
        correcting && (dose.status === 'Taken' || dose.status === 'Skipped')
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
          setError(
            'This dose changed elsewhere. Refresh the page, then review its current outcome before correcting it again.',
          )
        } else if (!(await refresh())) {
          setError('An outcome already exists for this dose. Refresh Today to see it.')
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
        setCorrecting(false)
        pinnedCorrection.current = null
        setEditor(null)
        requestAnimationFrame(() => correctionTrigger.current?.focus())
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

  return (
    <div className="space-y-2">
      {(dose.status === 'Taken' || dose.status === 'Skipped') && !correcting && (
        <button
          ref={correctionTrigger}
          type="button"
          className="min-h-11 rounded-md border px-3 underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          aria-label={`Correct outcome for ${medicine.label} at ${doseClock(dose.dueAt)}`}
          onClick={() => {
            if (dose.status === 'Taken' || dose.status === 'Skipped')
              pinnedCorrection.current = {
                outcome: dose.status,
                revision: dose.record.revision ?? 0,
              }
            setCorrecting(true)
          }}
        >
          Correct outcome
        </button>
      )}
      {correcting && (dose.status === 'Taken' || dose.status === 'Skipped') && (
        <p className="text-sm">Change {dose.status.toLowerCase()} to:</p>
      )}
      {((dose.status !== 'Taken' && dose.status !== 'Skipped') || correcting) && (
        <TakenForm
          dose={dose}
          medicine={medicine}
          open={editor === 'Taken'}
          blocked={
            editor === 'Skipped' ||
            ((dose.status === 'Taken' || dose.status === 'Skipped') &&
              (!correcting || dose.status === 'Taken'))
          }
          saving={saving}
          error={editor === 'Taken' ? error : ''}
          onOpen={(open) => {
            edit(open ? 'Taken' : null)
            if (!open && correcting) {
              setCorrecting(false)
              pinnedCorrection.current = null
              requestAnimationFrame(() => correctionTrigger.current?.focus())
            }
          }}
          onSubmit={(details) => void submit('Taken', details)}
        />
      )}
      {((dose.status !== 'Taken' && dose.status !== 'Skipped') || correcting) && (
        <SkippedForm
          dose={dose}
          medicine={medicine}
          open={editor === 'Skipped'}
          blocked={
            editor === 'Taken' ||
            ((dose.status === 'Taken' || dose.status === 'Skipped') &&
              (!correcting || dose.status === 'Skipped'))
          }
          saving={saving}
          error={editor === 'Skipped' ? error : ''}
          onOpen={(open) => {
            edit(open ? 'Skipped' : null)
            if (!open && correcting) {
              setCorrecting(false)
              pinnedCorrection.current = null
              requestAnimationFrame(() => correctionTrigger.current?.focus())
            }
          }}
          onSubmit={() => void submit('Skipped', {})}
          refresh={refresh}
        />
      )}
    </div>
  )
}
