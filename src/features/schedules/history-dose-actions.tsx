'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { Medicine } from '@/features/medicines/contract'
import { istanbulDate, type DoseOccurrence, type DoseOutcomeRecord } from './contract'
import { DoseStatusBadge } from './dose-status-badge'
import { DoseActions } from './dose-actions'
import { formatHistoryTime } from './format-history-time'

export function HistoryDoseActions({
  dose,
  medicine,
  date,
}: {
  dose: DoseOccurrence
  medicine?: Medicine
  date: string
}) {
  const [confirmed, setConfirmed] = useState<DoseOutcomeRecord | null>(null)
  const router = useRouter()
  const serverRevision =
    dose.status === 'Taken' || dose.status === 'Skipped' ? (dose.record.revision ?? 0) : 0
  const current =
    confirmed && (confirmed.revision ?? 0) > serverRevision
      ? ({ ...dose, status: confirmed.outcome, record: confirmed } as DoseOccurrence)
      : dose
  if (!medicine) return <DoseStatusBadge status={current.status} />
  return (
    <>
      <p role="status" className="sr-only">
        {confirmed && (
          <span key={confirmed.revision}>
            Saved changes for {medicine.label}, scheduled for {formatHistoryTime(dose.dueAt)}.{' '}
            Outcome: {confirmed.outcome.toLowerCase()}.
          </span>
        )}
      </p>
      <DoseStatusBadge status={current.status} />
      {current.status === 'Taken' && (
        <p className="text-sm">
          Taken{' '}
          <time data-dose-intake-time dateTime={current.record.takenAt}>
            {formatHistoryTime(
              current.record.takenAt,
              date !== istanbulDate(new Date(current.record.takenAt)),
            )}
          </time>{' '}
          {' - quantity '}
          {`${current.record.quantity} ${medicine.unit}`}
        </p>
      )}
      {current.status === 'Taken' || current.status === 'Skipped' ? (
        <DoseActions
          dose={current}
          medicine={medicine}
          refresh={async () => {
            router.refresh()
            return false
          }}
          onRecorded={(record: DoseOutcomeRecord) => {
            setConfirmed(record)
            router.refresh()
          }}
        />
      ) : null}
    </>
  )
}
