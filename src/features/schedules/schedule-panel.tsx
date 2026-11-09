'use client'

import type { ReactNode, Ref } from 'react'
import type { Medicine } from '@/features/medicines/contract'
import { useMedicines } from '@/features/medicines/queries'
import { SchedulingClockProvider } from './scheduling-clock'
import { useScheduleSnapshot } from './queries'
import { TodaySchedule } from './today-schedule'
import { ScheduleSetupForm } from './schedule-setup-form'
import { istanbulDate } from './contract'
import { MedicationDetail } from './medication-detail'
import { MedicationsList } from './medications-list'

export function SchedulePanel({
  mode = 'setup',
  initialMedicineId = '',
  onScheduleSaved,
  initialNow,
  serverEntry = false,
  focusMedicineId,
  onMedicineFocused,
  detailActions,
  justSaved,
  justScheduled,
  detailHeadingRef,
}: {
  /** The server scheduling time at render, until a newer schedules snapshot replaces it. */
  initialNow: string
  mode?: 'today' | 'setup' | 'list' | 'detail'
  initialMedicineId?: string
  /** Runs after the server confirms a first schedule. */
  onScheduleSaved?: (medicine: Medicine) => void
  /** This render's server read already refreshed both queries. */
  serverEntry?: boolean
  focusMedicineId?: string | null
  onMedicineFocused?: () => void
  justSaved?: boolean
  justScheduled?: boolean
  detailActions?: ReactNode
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
        {mode === 'detail' && (
          <MedicationDetail
            medicineId={initialMedicineId}
            medicinesRead={medicinesRead}
            schedulesRead={schedulesRead}
            now={now}
            actions={detailActions}
            justSaved={justSaved}
            justScheduled={justScheduled}
            headingRef={detailHeadingRef}
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
