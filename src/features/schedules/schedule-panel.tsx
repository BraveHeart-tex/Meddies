'use client'

import type { ReactNode, Ref } from 'react'
import type { Medicine } from '@/features/medicines/contract'
import { useMedicines } from '@/features/medicines/queries'
import { SchedulingClockProvider } from './scheduling-clock'
import { useScheduleSnapshot } from './queries'
import { TodaySchedule } from './today-schedule'
import { ScheduleSetupForm } from './schedule-setup-form'
import { istanbulDate } from './contract'
import { MedicineRecordScreen } from '@/features/medicines/medicine-record-screen'
import type { MedicineRecord } from '@/features/medicines/contract'
import { MedicationDetail } from './medication-detail'
import { MedicationsList } from './medications-list'
import { ArchivedMedications } from '@/features/medicines/archived-medications'
import { ScheduleResumeScreen } from './schedule-resume-screen'
import type { MedicationRecord } from '@/features/medicines/routes'
import { DoseHistoryScreen } from '@/features/dose-history/dose-history-screen'

export function SchedulePanel({
  mode = 'setup',
  initialMedicineId = '',
  onScheduleSaved,
  initialNow,
  serverEntry = false,
  focusMedicineId,
  onMedicineFocused,
  detailActions,
  detailHeadingRef,
  record,
  periodId,
  onRecordSaved,
  onArchiveRequested,
  onRestoreRequested,
  onDeleteRequested,
}: {
  /** The server scheduling time at render, until a newer schedules snapshot replaces it. */
  initialNow: string
  mode?: 'today' | 'setup' | 'resume' | 'list' | 'detail' | 'archived'
  initialMedicineId?: string
  /** Runs after the server confirms a first schedule. */
  onScheduleSaved?: (medicine: Medicine) => void
  /** This render's server read already refreshed both queries. */
  serverEntry?: boolean
  focusMedicineId?: string | null
  onMedicineFocused?: () => void
  detailActions?: ReactNode
  record?: MedicationRecord
  periodId?: string
  onArchiveRequested?: (medicine: Medicine) => void
  onRestoreRequested?: (medicine: Medicine) => void
  onDeleteRequested?: (medicine: Medicine) => void
  onRecordSaved?: (medicine: MedicineRecord, kind: 'fix' | 'strength') => void
  detailHeadingRef?: Ref<HTMLHeadingElement>
}) {
  const schedulesRead = useScheduleSnapshot({ serverEntry: serverEntry || mode === 'today' })
  const { snapshot } = schedulesRead
  const medicinesRead = useMedicines({ serverEntry })
  // The latest server scheduling time anchors the clock: a snapshot cached before this render
  // is older than `initialNow`, one read since is newer.
  const now = snapshot && snapshot.now > initialNow ? snapshot.now : initialNow
  return (
    <SchedulingClockProvider serverNow={now}>
      <div className="space-y-10">
        {mode === 'today' && <TodaySchedule schedulesRead={schedulesRead} serverNow={now} />}
        {mode === 'list' && (
          <MedicationsList
            medicinesRead={medicinesRead}
            schedulesRead={schedulesRead}
            now={now}
            focusMedicineId={focusMedicineId}
            onMedicineFocused={onMedicineFocused}
          />
        )}
        {mode === 'archived' && <ArchivedMedications medicinesRead={medicinesRead} />}
        {mode === 'detail' && record === 'doses' && (
          <DoseHistoryScreen
            medicinesRead={medicinesRead}
            medicineId={initialMedicineId}
            today={istanbulDate(new Date(now))}
          />
        )}
        {mode === 'detail' && record && record !== 'doses' && (
          <MedicineRecordScreen
            medicinesRead={medicinesRead}
            medicineId={initialMedicineId}
            record={record}
            periodId={periodId}
            today={istanbulDate(new Date(now))}
            onSaved={(medicine, kind) => onRecordSaved?.(medicine, kind)}
          />
        )}
        {mode === 'detail' && !record && (
          <MedicationDetail
            medicineId={initialMedicineId}
            medicinesRead={medicinesRead}
            schedulesRead={schedulesRead}
            now={now}
            actions={detailActions}
            onArchiveRequested={onArchiveRequested}
            onRestoreRequested={onRestoreRequested}
            onDeleteRequested={onDeleteRequested}
            headingRef={detailHeadingRef}
          />
        )}
        {mode === 'resume' && (
          <ScheduleResumeScreen
            schedulesRead={schedulesRead}
            now={now}
            medicineId={initialMedicineId}
            serverEntry={serverEntry}
          />
        )}
        {mode === 'setup' && (
          <ScheduleSetupForm
            schedulesRead={schedulesRead}
            today={istanbulDate(new Date(now))}
            now={now}
            medicineId={initialMedicineId}
            onSaved={onScheduleSaved}
            serverEntry={serverEntry}
          />
        )}
      </div>
    </SchedulingClockProvider>
  )
}
