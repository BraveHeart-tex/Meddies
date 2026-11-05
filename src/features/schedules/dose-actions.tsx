'use client'

import { useRef, useState } from 'react'
import type { Medicine } from '@/features/medicines/contract'
import { parseDoseOutcomeRecord, type DoseOccurrence, type DoseOutcomeRecord } from './contract'
import { SkippedForm } from './skipped-form'
import { TakenForm } from './taken-form'

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
  const locked = useRef(false)

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
      const response = await fetch('/api/schedules', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(12000),
        body: JSON.stringify({
          ...details,
          outcome,
          scheduleId: dose.scheduleId,
          dueAt: dose.dueAt,
        }),
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
        if (!(await refresh()))
          setError('An outcome already exists for this dose. Refresh Today to see it.')
      } else if (response.ok) {
        const body = await response.json()
        const record = parseDoseOutcomeRecord(body.record)
        if (
          record.outcome !== outcome ||
          record.scheduleId !== dose.scheduleId ||
          record.dueAt !== dose.dueAt
        )
          throw new Error('acknowledgment')
        onRecorded(record)
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
      <TakenForm
        dose={dose}
        medicine={medicine}
        open={editor === 'Taken'}
        blocked={editor === 'Skipped'}
        saving={saving}
        error={editor === 'Taken' ? error : ''}
        onOpen={(open) => edit(open ? 'Taken' : null)}
        onSubmit={(details) => void submit('Taken', details)}
      />
      <SkippedForm
        dose={dose}
        medicine={medicine}
        open={editor === 'Skipped'}
        blocked={editor === 'Taken'}
        saving={saving}
        error={editor === 'Skipped' ? error : ''}
        onOpen={(open) => edit(open ? 'Skipped' : null)}
        onSubmit={() => void submit('Skipped', {})}
        refresh={refresh}
      />
    </div>
  )
}
