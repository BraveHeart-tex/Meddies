'use client'

import {
  MedicationDetailSkeleton,
  MedicationSetupSkeleton,
  MedicationsListSkeleton,
} from './medications-skeleton'
import { MedicinePanel } from './medicine-panel'
import { useMedicationsView, useMedicationsViewScroll } from './medications-nav'

/** The one mounted panel, on whichever view the URL names. */
export function MedicationsScreen({
  initialNow,
  serverEntry,
  loading = false,
}: {
  initialNow: string
  serverEntry?: boolean
  loading?: boolean
}) {
  const view = useMedicationsView()
  const medicineId = 'medicineId' in view ? view.medicineId : ''
  useMedicationsViewScroll(
    `${view.mode}:${medicineId}:${view.mode === 'detail' ? `${view.record ?? ''}:${view.periodId ?? ''}:${view.manage ? 'manage' : ''}` : ''}`,
  )
  return (
    <MedicinePanel
      loading={
        loading ? (
          view.mode === 'detail' ? (
            <MedicationDetailSkeleton />
          ) : view.mode === 'setup' || view.mode === 'resume' ? (
            <MedicationSetupSkeleton />
          ) : (
            <MedicationsListSkeleton />
          )
        ) : undefined
      }
      scheduleMode={view.mode}
      scheduleMedicineId={view.mode === 'setup' || view.mode === 'resume' ? medicineId : ''}
      detailMedicineId={view.mode === 'detail' ? medicineId : ''}
      record={view.mode === 'detail' ? view.record : undefined}
      periodId={view.mode === 'detail' ? view.periodId : undefined}
      manage={view.mode === 'detail' && Boolean(view.manage)}
      initialNow={initialNow}
      serverEntry={serverEntry}
    />
  )
}
