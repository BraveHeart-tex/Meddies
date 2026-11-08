'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ChevronLeftIcon } from 'lucide-react'
import { SchedulePanel } from '@/features/schedules/schedule-panel'
import { Button, buttonVariants } from '@/components/ui/button'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Icon } from '@/components/ui/icon'
import { AppHeader } from '@/components/layout/app-header'
import { MedicationTile } from './medication-tile'
import { MedicineForm } from './medicine-form'
import type { Medicine } from './contract'
import { useMedicines } from './queries'

export function MedicinePanel({
  scheduleMode = 'list',
  scheduleMedicineId = '',
  detailMedicineId = '',
  initialNow,
}: {
  scheduleMode?: 'add' | 'setup' | 'list' | 'detail'
  scheduleMedicineId?: string
  detailMedicineId?: string
  initialNow: string
}) {
  const router = useRouter()
  // Handoff from Add to the saved medicine's page (FE-647 D7). Panel state carries it across
  // the replace navigation (one mounted panel per /medications); a reload drops it.
  const [savedMedicine, setSavedMedicine] = useState<Medicine | null>(null)
  // Handoff from schedule setup to the medicine's page (FE-647 D4), carried the same way.
  const [scheduledMedicine, setScheduledMedicine] = useState<Medicine | null>(null)
  const {
    medicines,
    loading,
    loadError,
    refreshFailed,
    refreshing,
    retry: retryMedicines,
  } = useMedicines()
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
      router.replace(`/medications?medicine=${encodeURIComponent(medicine.id)}`)
  }

  function saved(medicine: Medicine) {
    setSavedMedicine(medicine)
    // Never navigate someone who has already left the Add screen.
    if (mounted.current && mode.current === 'add')
      router.replace(`/medications?medicine=${encodeURIComponent(medicine.id)}`)
  }

  if (scheduleMode === 'add')
    return (
      <div className="flex flex-col gap-5">
        <Link
          href="/medications"
          className={buttonVariants({ variant: 'ghost', className: '-ml-3 self-start' })}
        >
          <ChevronLeftIcon data-icon="inline-start" aria-hidden="true" />
          Medications
        </Link>
        <AppHeader
          title="Add medication"
          subtitle="Saved once Meddies has it. You can set a schedule straight after, or later."
        />
        <MedicineForm onSaved={saved} />
      </div>
    )

  const detail = medicines.find((item) => item.id === detailMedicineId)
  return (
    <div className="flex flex-col gap-5">
      <AppHeader
        title="Medications"
        subtitle={
          scheduleMode === 'list' && !loading && !loadError
            ? `${medicines.length} ${medicines.length === 1 ? 'medication' : 'medications'}`
            : undefined
        }
        action={
          scheduleMode === 'list' && (
            <Link
              href="/medications?add"
              aria-label="Add a medication"
              className={buttonVariants({ className: 'rounded-full' })}
            >
              <Icon name="plus" data-icon="inline-start" />
              Add
            </Link>
          )
        }
      />
      {refreshFailed && (
        <Alert role="status">
          <AlertDescription className="flex flex-col items-start gap-2 text-foreground">
            <p>Your medications didn&apos;t update just now. Showing the last list that loaded.</p>
            <Button
              variant="outline"
              className="min-h-11"
              disabled={refreshing}
              onClick={retryMedicines}
            >
              {refreshing ? 'Retrying…' : 'Try loading medications again'}
            </Button>
          </AlertDescription>
        </Alert>
      )}
      {scheduleMode === 'detail' && detail && (
        <Card role="region" aria-labelledby="medicine-detail" className="[overflow-wrap:anywhere]">
          <CardHeader className="flex items-center gap-3.5">
            <MedicationTile medicineId={detailMedicineId} />
            <CardTitle>
              <h2 id="medicine-detail" ref={detailHeading} tabIndex={-1} className="outline-none">
                {detail.label}
              </h2>
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-1">
            <p>Strength: {detail.strength || 'Not added'}</p>
            <p>Unit: {detail.unit}</p>
            <p className="text-label text-muted-foreground">
              Medication details can&apos;t be changed here.
            </p>
          </CardContent>
        </Card>
      )}
      {justSavedHere && (
        <section
          aria-label="Saved medication"
          className="flex flex-col gap-3 [overflow-wrap:anywhere]"
        >
          <Alert variant="confirmation" role="status">
            <AlertTitle>{savedMedicine.label} saved.</AlertTitle>
          </Alert>
          <div className="flex flex-col gap-2.5">
            <Link
              href={`/medications?schedule=${encodeURIComponent(savedMedicine.id)}#schedule-heading`}
              className={buttonVariants({ size: 'lg' })}
            >
              Set schedule
            </Link>
            <Link
              href="/medications"
              className={buttonVariants({ size: 'lg', variant: 'outline' })}
            >
              Done for now
            </Link>
          </div>
        </section>
      )}
      {justScheduledHere && (
        <Alert variant="confirmation" role="status">
          <AlertTitle>Schedule saved for {scheduledMedicine.label}.</AlertTitle>
        </Alert>
      )}
      <SchedulePanel
        initialNow={initialNow}
        onScheduleSaved={scheduled}
        mode={scheduleMode}
        initialMedicineId={scheduleMedicineId || detailMedicineId}
      />
    </div>
  )
}
