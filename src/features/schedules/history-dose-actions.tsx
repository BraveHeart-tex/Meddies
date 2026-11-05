'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { Medicine } from '@/features/medicines/contract'
import {
  istanbulDate,
  SCHEDULE_TIMEZONE,
  type DoseOccurrence,
  type DoseOutcomeRecord,
} from './contract'
import { DoseActions } from './dose-actions'

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
  if (!medicine) return <p className="text-sm">{current.status}</p>
  const displayTime = (instant: string, includeDate = false) => {
    const options: Intl.DateTimeFormatOptions = includeDate
      ? { dateStyle: 'medium', timeStyle: 'short' }
      : { hour: 'numeric', minute: '2-digit' }
    return new Intl.DateTimeFormat('en', { timeZone: SCHEDULE_TIMEZONE, ...options }).format(
      new Date(instant),
    )
  }
  return (
    <>
      <p className="text-sm">{current.status}</p>
      {current.status === 'Taken' && (
        <p className="text-sm">
          Taken{' '}
          <time dateTime={current.record.takenAt}>
            {displayTime(
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
