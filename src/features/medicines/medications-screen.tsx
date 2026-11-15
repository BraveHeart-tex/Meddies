'use client'

import { MedicinePanel } from './medicine-panel'
import { useMedicationsView, useMedicationsViewScroll } from './medications-nav'

/** The one mounted panel, on whichever view the URL names. */
export function MedicationsScreen({
  initialNow,
  serverEntry,
}: {
  initialNow: string
  serverEntry?: boolean
}) {
  const view = useMedicationsView()
  const medicineId = 'medicineId' in view ? view.medicineId : ''
  useMedicationsViewScroll(
    `${view.mode}:${medicineId}:${view.mode === 'detail' ? `${view.record ?? ''}:${view.periodId ?? ''}` : ''}`,
  )
  return (
    <MedicinePanel
      scheduleMode={view.mode}
      scheduleMedicineId={view.mode === 'setup' || view.mode === 'resume' ? medicineId : ''}
      detailMedicineId={view.mode === 'detail' ? medicineId : ''}
      record={view.mode === 'detail' ? view.record : undefined}
      periodId={view.mode === 'detail' ? view.periodId : undefined}
      initialNow={initialNow}
      serverEntry={serverEntry}
    />
  )
}
