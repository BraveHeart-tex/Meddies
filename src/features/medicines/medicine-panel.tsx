'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ChevronLeftIcon } from 'lucide-react'
import { SchedulePanel } from '@/features/schedules/schedule-panel'
import { buttonVariants } from '@/components/ui/button'
import { Alert, AlertTitle } from '@/components/ui/alert'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Icon } from '@/components/ui/icon'
import { AppHeader } from '@/components/layout/app-header'
import { MedicationTile } from './medication-tile'
import { MedicineForm } from './medicine-form'
import { parseMedicine, type Medicine } from './contract'

export function MedicinePanel({
  scheduleMode = 'list',
  scheduleMedicineId = '',
  detailMedicineId = '',
  initialNow,
}: {
  scheduleMode?: 'add' | 'setup' | 'today' | 'list' | 'detail'
  scheduleMedicineId?: string
  detailMedicineId?: string
  initialNow: string
}) {
  const router = useRouter()
  // Handoff from Add to the saved medicine's page (FE-647 D7). Panel state carries it across
  // the replace navigation (one mounted panel per /medications); a reload drops it.
  const [savedMedicine, setSavedMedicine] = useState<Medicine | null>(null)
  const [medicines, setMedicines] = useState<Medicine[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const mounted = useRef(true)
  const generation = useRef(0)
  const mode = useRef(scheduleMode)
  const detailHeading = useRef<HTMLHeadingElement>(null)
  const load = useCallback(async () => {
    const current = ++generation.current
    try {
      const response = await fetch('/api/medicines', {
        cache: 'no-store',
        signal: AbortSignal.timeout(12000),
      })
      if (!response.ok) throw new Error('load')
      const data = await response.json()
      const loaded = data.medicines.map(parseMedicine)
      if (mounted.current && current === generation.current) {
        setMedicines(loaded)
        setLoadError(false)
      }
    } catch {
      if (mounted.current && current === generation.current) setLoadError(true)
    } finally {
      if (mounted.current && current === generation.current) setLoading(false)
    }
  }, [])
  function retryMedicines() {
    setLoading(true)
    setLoadError(false)
    void load()
  }
  useEffect(() => {
    mounted.current = true
    // load updates state only after the network settles.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
    return () => {
      mounted.current = false
    }
  }, [load])
  useEffect(() => {
    mode.current = scheduleMode
  }, [scheduleMode])
  const justSavedHere = scheduleMode === 'detail' && savedMedicine?.id === detailMedicineId
  // The panel stays mounted across query-state navigation, so drop the confirmation once she
  // leaves the saved medicine's page (Back must not show it again).
  const screen = `${scheduleMode}:${detailMedicineId}`
  const [previousScreen, setPreviousScreen] = useState(screen)
  if (previousScreen !== screen) {
    setPreviousScreen(screen)
    if (savedMedicine && scheduleMode !== 'add' && !justSavedHere) setSavedMedicine(null)
  }
  useEffect(() => {
    if (!justSavedHere) return
    // After the replace navigation, focus the page heading (FE-647 a11y).
    detailHeading.current?.focus()
  }, [justSavedHere])

  function saved(medicine: Medicine) {
    setMedicines((previous) => [...previous.filter((item) => item.id !== medicine.id), medicine])
    setSavedMedicine(medicine)
    // Never navigate someone who has already left the Add screen.
    if (mounted.current && mode.current === 'add')
      router.replace(`/medications?medicine=${encodeURIComponent(medicine.id)}`)
    // A fresh read includes older medicines even if the initial list was still pending.
    setLoadError(false)
    setLoading(true)
    void load()
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
          title="Add medicine"
          subtitle="Saved once Meddies confirms it. You can set a schedule straight after, or later."
        />
        <MedicineForm onSaved={saved} />
      </div>
    )

  const detail = medicines.find((item) => item.id === detailMedicineId)
  return (
    <div className="flex flex-col gap-5">
      {scheduleMode !== 'today' && (
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
                aria-label="Add a medicine"
                className={buttonVariants({ className: 'rounded-full' })}
              >
                <Icon name="plus" data-icon="inline-start" />
                Add
              </Link>
            )
          }
        />
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
            <p>Product strength: {detail.strength || 'Not provided'}</p>
            <p>Unit: {detail.unit}</p>
            <p className="text-label text-muted-foreground">
              Medicine details are saved and cannot be edited here.
            </p>
          </CardContent>
        </Card>
      )}
      {justSavedHere && (
        <section
          aria-label="Saved medicine"
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
      <SchedulePanel
        initialNow={initialNow}
        medicines={medicines}
        mode={scheduleMode}
        initialMedicineId={scheduleMedicineId || detailMedicineId}
        medicinesLoading={loading}
        medicinesError={loadError}
        retryMedicines={retryMedicines}
      />
    </div>
  )
}
