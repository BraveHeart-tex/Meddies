'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import {
  confirmDeleted,
  confirmMedicationSaved,
  confirmRecordSaved,
  confirmRestored,
} from '@/features/schedules/medication-confirmations'
import { SchedulePanel } from '@/features/schedules/schedule-panel'
import { buttonVariants } from '@/components/ui/button'
import { MedicineArchiveDrawer } from './medicine-archive-drawer'
import { MedicineDeleteDrawer } from './medicine-delete-drawer'
import { MedicineAddDrawer } from './medicine-add-drawer'
import type { Medicine } from './contract'
import { MedicationsLink, returnToMedicationPage, showMedicationsView } from './medications-nav'
import { medicationsHref, type MedicationRecord } from './routes'

export function MedicinePanel({
  scheduleMode = 'list',
  scheduleMedicineId = '',
  detailMedicineId = '',
  initialNow,
  serverEntry = false,
  record,
  periodId,
  manage = false,
  loading,
}: {
  scheduleMode?: 'add' | 'setup' | 'resume' | 'list' | 'detail' | 'archived'
  scheduleMedicineId?: string
  detailMedicineId?: string
  initialNow: string
  /** Holds only the data view while the server streams; the Add Drawer stays mounted. */
  loading?: ReactNode
  /** This render's server read already refreshed both queries, so views don't read again. */
  record?: MedicationRecord
  periodId?: string
  /** Medication detail shows its Manage sub-screen. */
  manage?: boolean
  /** This render's server read already refreshed both queries. */
  serverEntry?: boolean
}) {
  // Handoff from Add to the saved medicine's page. Panel state carries it across
  // the replace navigation (one mounted panel per /medications); a reload drops it.
  const [savedMedicine, setSavedMedicine] = useState<Medicine | null>(null)
  // Handoff from schedule setup to the medicine's page, carried the same way.
  const [scheduledMedicine, setScheduledMedicine] = useState<Medicine | null>(null)
  // Done for now hands focus to the saved medicine's list row.
  const [focusMedicineId, setFocusMedicineId] = useState<string | null>(null)
  const [archive, setArchive] = useState<{ medicine: Medicine; open: boolean } | null>(null)
  const [restore, setRestore] = useState<{ medicine: Medicine; open: boolean } | null>(null)
  const [deletion, setDeletion] = useState<{ medicine: Medicine; open: boolean } | null>(null)
  const mounted = useRef(true)
  const mode = useRef(scheduleMode)
  const setupMedicineId = useRef(scheduleMedicineId)
  const detailHeading = useRef<HTMLHeadingElement>(null)
  // A confirmed record save hands focus to the detail heading it returns to.
  const focusAfterRecord = useRef(false)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  useEffect(() => {
    mode.current = scheduleMode
    setupMedicineId.current = scheduleMedicineId
  }, [scheduleMode, scheduleMedicineId])
  const justSavedHere = scheduleMode === 'detail' && savedMedicine?.id === detailMedicineId
  const justScheduledHere = scheduleMode === 'detail' && scheduledMedicine?.id === detailMedicineId
  // The panel stays mounted across query-state navigation, so drop the handoff once she
  // leaves the saved medicine's page (Back must not offer Done for now again).
  const screen = `${scheduleMode}:${detailMedicineId}:${record ?? ''}`
  const [previousScreen, setPreviousScreen] = useState(screen)
  if (previousScreen !== screen) {
    setPreviousScreen(screen)
    if (savedMedicine && scheduleMode !== 'add' && !justSavedHere) setSavedMedicine(null)
    if (scheduledMedicine && scheduleMode !== 'setup' && !justScheduledHere)
      setScheduledMedicine(null)
  }
  useEffect(() => {
    if (!justSavedHere && !justScheduledHere) return
    // After the replace navigation, focus the page heading (#107 a11y).
    detailHeading.current?.focus()
  }, [justSavedHere, justScheduledHere])

  useEffect(() => {
    if (record || !focusAfterRecord.current) return
    focusAfterRecord.current = false
    detailHeading.current?.focus()
  }, [record])

  function scheduled(medicine: Medicine) {
    setScheduledMedicine(medicine)
    // Never navigate someone who has already left this medicine's setup.
    if (mounted.current && mode.current === 'setup' && setupMedicineId.current === medicine.id)
      returnToMedicationPage(medicine.id)
  }

  function saved(medicine: Medicine) {
    confirmMedicationSaved(medicine.label)
    setSavedMedicine(medicine)
    // Never navigate someone who has already left the Add screen.
    if (mounted.current && mode.current === 'add')
      showMedicationsView(medicationsHref({ mode: 'detail', medicineId: medicine.id }), 'replace')
  }

  return (
    <>
      {loading ?? (
        <SchedulePanel
          onArchiveRequested={(medicine) => setArchive({ medicine, open: true })}
          onRestoreRequested={(medicine) => setRestore({ medicine, open: true })}
          onDeleteRequested={(medicine) => setDeletion({ medicine, open: true })}
          record={record}
          periodId={periodId}
          manage={manage}
          onRecordSaved={(medicine, kind) => {
            confirmRecordSaved(kind)
            focusAfterRecord.current = true
            returnToMedicationPage(medicine.id)
          }}
          initialNow={initialNow}
          onScheduleSaved={scheduled}
          // Add opens as a Drawer over the list.
          mode={scheduleMode === 'add' ? 'list' : scheduleMode}
          initialMedicineId={scheduleMedicineId || detailMedicineId}
          serverEntry={serverEntry}
          focusMedicineId={focusMedicineId}
          onMedicineFocused={() => setFocusMedicineId(null)}
          detailHeadingRef={detailHeading}
          detailActions={
            justSavedHere ? (
              <MedicationsLink
                href={medicationsHref({ mode: 'list' })}
                onShow={() => setFocusMedicineId(savedMedicine.id)}
                className={buttonVariants({ size: 'lg', variant: 'outline' })}
              >
                Done for now
              </MedicationsLink>
            ) : null
          }
        />
      )}
      {archive && (
        <MedicineArchiveDrawer
          key={archive.medicine.id}
          medicine={archive.medicine}
          // Opened from Manage, so leaving Manage closes it.
          open={
            archive.open &&
            scheduleMode === 'detail' &&
            manage &&
            detailMedicineId === archive.medicine.id
          }
          onClose={() => setArchive({ ...archive, open: false })}
          // The confirmed record is cached, so this same page now shows the archived detail.
          onSaved={() => setArchive({ ...archive, open: false })}
          heading={detailHeading}
        />
      )}
      {restore && (
        <MedicineArchiveDrawer
          key={`restore-${restore.medicine.id}`}
          action="restore"
          medicine={restore.medicine}
          open={
            restore.open &&
            scheduleMode === 'detail' &&
            !record &&
            detailMedicineId === restore.medicine.id
          }
          onClose={() => setRestore({ ...restore, open: false })}
          // The confirmed record is cached, so this same page now shows the restored detail.
          onSaved={() => {
            setRestore({ ...restore, open: false })
            confirmRestored(restore.medicine.label)
          }}
          heading={detailHeading}
        />
      )}
      {deletion && (
        <MedicineDeleteDrawer
          key={deletion.medicine.id}
          medicine={deletion.medicine}
          // Opened from Manage, so leaving Manage closes it.
          open={
            deletion.open &&
            scheduleMode === 'detail' &&
            manage &&
            detailMedicineId === deletion.medicine.id
          }
          onClose={() => setDeletion({ ...deletion, open: false })}
          onDeleted={() => {
            setDeletion({ ...deletion, open: false })
            confirmDeleted(deletion.medicine.label)
            showMedicationsView(medicationsHref({ mode: 'list' }), 'replace')
          }}
        />
      )}
      <MedicineAddDrawer
        open={scheduleMode === 'add'}
        returnFocus={scheduleMode === 'list'}
        onSaved={saved}
      />
    </>
  )
}
