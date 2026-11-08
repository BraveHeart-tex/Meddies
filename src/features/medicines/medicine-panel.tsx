'use client'

import { useEffect, useRef, useState } from 'react'
import { SchedulePanel } from '@/features/schedules/schedule-panel'
import { buttonVariants } from '@/components/ui/button'
import { Alert, AlertTitle } from '@/components/ui/alert'
import { MedicineForm } from './medicine-form'
import type { Medicine } from './contract'
import { MedicationsLink, showMedicationsView } from './medications-nav'
import { medicationSetupHref, medicationsHref } from './routes'

export function MedicinePanel({
  scheduleMode = 'list',
  scheduleMedicineId = '',
  detailMedicineId = '',
  initialNow,
  serverEntry = false,
}: {
  scheduleMode?: 'add' | 'setup' | 'list' | 'detail'
  scheduleMedicineId?: string
  detailMedicineId?: string
  initialNow: string
  /** This render's server read already refreshed both queries, so views don't read again. */
  serverEntry?: boolean
}) {
  // Handoff from Add to the saved medicine's page (FE-647 D7). Panel state carries it across
  // the replace navigation (one mounted panel per /medications); a reload drops it.
  const [savedMedicine, setSavedMedicine] = useState<Medicine | null>(null)
  // Handoff from schedule setup to the medicine's page (FE-647 D4), carried the same way.
  const [scheduledMedicine, setScheduledMedicine] = useState<Medicine | null>(null)
  // Done for now hands focus to the saved medicine's list row (647·B1).
  const [focusMedicineId, setFocusMedicineId] = useState<string | null>(null)
  const mounted = useRef(true)
  const mode = useRef(scheduleMode)
  const setupMedicineId = useRef(scheduleMedicineId)
  const detailHeading = useRef<HTMLHeadingElement>(null)
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
  // The panel stays mounted across query-state navigation, so drop the confirmation once she
  // leaves the saved medicine's page (Back must not show it again).
  const screen = `${scheduleMode}:${detailMedicineId}`
  const [previousScreen, setPreviousScreen] = useState(screen)
  if (previousScreen !== screen) {
    setPreviousScreen(screen)
    if (savedMedicine && scheduleMode !== 'add' && !justSavedHere) setSavedMedicine(null)
    if (scheduledMedicine && scheduleMode !== 'setup' && !justScheduledHere)
      setScheduledMedicine(null)
  }
  useEffect(() => {
    if (!justSavedHere && !justScheduledHere) return
    // After the replace navigation, focus the page heading (FE-647 a11y).
    detailHeading.current?.focus()
  }, [justSavedHere, justScheduledHere])

  function scheduled(medicine: Medicine) {
    setScheduledMedicine(medicine)
    // Never navigate someone who has already left this medicine's setup.
    if (mounted.current && mode.current === 'setup' && setupMedicineId.current === medicine.id)
      showMedicationsView(medicationsHref({ mode: 'detail', medicineId: medicine.id }), 'replace')
  }

  function saved(medicine: Medicine) {
    setSavedMedicine(medicine)
    // Never navigate someone who has already left the Add screen.
    if (mounted.current && mode.current === 'add')
      showMedicationsView(medicationsHref({ mode: 'detail', medicineId: medicine.id }), 'replace')
  }

  if (scheduleMode === 'add') return <MedicineForm onSaved={saved} />

  return (
    <SchedulePanel
      initialNow={initialNow}
      onScheduleSaved={scheduled}
      mode={scheduleMode}
      initialMedicineId={scheduleMedicineId || detailMedicineId}
      serverEntry={serverEntry}
      focusMedicineId={focusMedicineId}
      onMedicineFocused={() => setFocusMedicineId(null)}
      detailHeadingRef={detailHeading}
      detailNotices={
        <>
          {justSavedHere && (
            <section
              aria-label="Saved medication"
              className="flex flex-col gap-3 [overflow-wrap:anywhere]"
            >
              <Alert variant="confirmation" role="status">
                <AlertTitle>{savedMedicine.label} saved.</AlertTitle>
              </Alert>
              <div className="flex flex-col gap-2.5">
                <MedicationsLink
                  href={medicationSetupHref(savedMedicine.id)}
                  className={buttonVariants({ size: 'lg' })}
                >
                  Set schedule
                </MedicationsLink>
                <MedicationsLink
                  href={medicationsHref({ mode: 'list' })}
                  onShow={() => setFocusMedicineId(savedMedicine.id)}
                  className={buttonVariants({ size: 'lg', variant: 'outline' })}
                >
                  Done for now
                </MedicationsLink>
              </div>
            </section>
          )}
          {justScheduledHere && (
            <Alert variant="confirmation" role="status">
              <AlertTitle>Schedule saved for {scheduledMedicine.label}.</AlertTitle>
            </Alert>
          )}
        </>
      }
    />
  )
}
