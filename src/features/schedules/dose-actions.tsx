'use client'

import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import type { Medicine } from '@/features/medicines/contract'
import { parseDoseOutcomeRecord, type DoseOccurrence, type DoseOutcomeRecord } from './contract'
import { SkippedForm } from './skipped-form'
import { doseClock, TakenForm } from './taken-form'
import { DoseSheet } from './dose-sheet'

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
  const [editingDose, setEditingDose] = useState<DoseOccurrence | null>(null)
  const [needsReview, setNeedsReview] = useState(false)
  const [sheetOpen, setSheetOpen] = useState(false)
  const locked = useRef(false)
  const rowTrigger = useRef<HTMLButtonElement>(null)
  const retryAction = useRef<{ fingerprint: string; id: string } | null>(null)
  const pinnedCorrection = useRef<{ outcome: 'Taken' | 'Skipped'; revision: number } | null>(null)
  const [openedWithoutOutcome, setOpenedWithoutOutcome] = useState(false)

  function edit(outcome: Outcome | null) {
    setEditor(outcome)
    setError('')
    setNeedsReview(false)
  }

  function closeAfterConflict(message: string) {
    retryAction.current = null
    pinnedCorrection.current = null
    setCorrecting(false)
    setEditingDose(null)
    setEditor(null)
    setSheetOpen(false)
    setOpenedWithoutOutcome(false)
    setError(message)
    setNeedsReview(true)
    requestAnimationFrame(() => rowTrigger.current?.focus())
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
        setCorrecting(false)
        setEditingDose(null)
        pinnedCorrection.current = null
        setEditor(null)
        setSheetOpen(false)
        setOpenedWithoutOutcome(false)
        requestAnimationFrame(() => rowTrigger.current?.focus())
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
    <div>
      <Button
        ref={rowTrigger}
        id={`dose-actions-${dose.id}`}
        type="button"
        variant="outline"
        className="min-h-11"
        aria-haspopup="dialog"
        aria-expanded={sheetOpen}
        aria-label={`${dose.status === 'Taken' || dose.status === 'Skipped' ? 'Review' : 'Record'} dose for ${medicine.label} scheduled at ${doseClock(dose.dueAt)}`}
        onClick={() => {
          setError('')
          setNeedsReview(false)
          setSheetOpen(true)
        }}
      >
        {dose.status === 'Taken' || dose.status === 'Skipped' ? 'Review dose' : 'Record dose'}
      </Button>
      {!sheetOpen && error && editor === null && !correcting && editingDose === null && (
        <div role="alert" className="mt-2 space-y-2 [overflow-wrap:anywhere]">
          <p>{error}</p>
          {needsReview && (
            <button
              type="button"
              className="min-h-11 rounded-md border px-3 underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              onClick={() => {
                void refresh()
                setNeedsReview(false)
              }}
            >
              Review current outcome
            </button>
          )}
        </div>
      )}
      <DoseSheet
        open={sheetOpen}
        triggerId={`dose-actions-${dose.id}`}
        title={`${medicine.label} · ${doseClock(dose.dueAt)} Istanbul`}
        onClose={() => {
          if (saving) return
          setSheetOpen(false)
          setEditor(null)
          setCorrecting(false)
          setEditingDose(null)
          setOpenedWithoutOutcome(false)
        }}
      >
        <div className="space-y-3">
          {openedWithoutOutcome &&
            (dose.status === 'Taken' || dose.status === 'Skipped') &&
            editor !== null && (
              <p role="status">
                This dose was recorded while your form was open. Your draft is still here; review
                the outcome before saving.
              </p>
            )}
          {(dose.status === 'Taken' || dose.status === 'Skipped') && !correcting && (
            <>
              {(dose.status === 'Taken' || editingDose !== null) &&
                (editingDose ?? dose).status === 'Taken' && (
                  <TakenForm
                    dose={editingDose ?? dose}
                    medicine={medicine}
                    open={editingDose !== null}
                    blocked={false}
                    saving={saving}
                    error={editingDose ? error : ''}
                    editing
                    onOpen={(open) => {
                      setError('')
                      if (open && dose.status === 'Taken') {
                        setEditingDose(dose)
                        pinnedCorrection.current = {
                          outcome: 'Taken',
                          revision: dose.record.revision ?? 0,
                        }
                      }
                      if (!open) {
                        retryAction.current = null
                        pinnedCorrection.current = null
                        setEditingDose(null)
                        setSheetOpen(false)
                      }
                    }}
                    onSubmit={(details) => void submit('Taken', details)}
                  />
                )}
              {editingDose === null && (dose.status === 'Taken' || dose.status === 'Skipped') && (
                <button
                  type="button"
                  className="min-h-11 rounded-md border px-3 underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                  aria-label={`Correct outcome for ${medicine.label} at ${doseClock(dose.dueAt)}`}
                  onClick={() => {
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
            </>
          )}
          {correcting && (dose.status === 'Taken' || dose.status === 'Skipped') && (
            <p className="text-sm">Change {dose.status.toLowerCase()} to:</p>
          )}
          {((dose.status !== 'Taken' && dose.status !== 'Skipped') ||
            correcting ||
            editor === 'Taken') && (
            <TakenForm
              dose={dose}
              medicine={medicine}
              open={editor === 'Taken'}
              blocked={
                editor === 'Skipped' ||
                ((dose.status === 'Taken' || dose.status === 'Skipped') &&
                  !openedWithoutOutcome &&
                  (!correcting || dose.status === 'Taken'))
              }
              saving={saving}
              error={editor === 'Taken' ? error : ''}
              onOpen={(open) => {
                edit(open ? 'Taken' : null)
                if (open && dose.status !== 'Taken' && dose.status !== 'Skipped')
                  setOpenedWithoutOutcome(true)
                if (!open) setOpenedWithoutOutcome(false)
                if (!open) setSheetOpen(false)
                if (!open && correcting) {
                  setCorrecting(false)
                  pinnedCorrection.current = null
                }
              }}
              onSubmit={(details) => void submit('Taken', details)}
            />
          )}
          {((dose.status !== 'Taken' && dose.status !== 'Skipped') ||
            correcting ||
            editor === 'Skipped') && (
            <SkippedForm
              dose={dose}
              medicine={medicine}
              open={editor === 'Skipped'}
              blocked={
                editor === 'Taken' ||
                ((dose.status === 'Taken' || dose.status === 'Skipped') &&
                  !openedWithoutOutcome &&
                  (!correcting || dose.status === 'Skipped'))
              }
              saving={saving}
              error={editor === 'Skipped' ? error : ''}
              onOpen={(open) => {
                edit(open ? 'Skipped' : null)
                if (open && dose.status !== 'Taken' && dose.status !== 'Skipped')
                  setOpenedWithoutOutcome(true)
                if (!open) setOpenedWithoutOutcome(false)
                if (!open) setSheetOpen(false)
                if (!open && correcting) {
                  setCorrecting(false)
                  pinnedCorrection.current = null
                }
              }}
              onSubmit={() => void submit('Skipped', {})}
              refresh={refresh}
            />
          )}
        </div>
      </DoseSheet>
    </div>
  )
}
