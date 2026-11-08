'use client'

import { useState } from 'react'
import Link from 'next/link'
import { InfoIcon } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button, buttonVariants } from '@/components/ui/button'
import type { Medicine } from '@/features/medicines/contract'
import { MedicationTile } from '@/features/medicines/medication-tile'
import { useMedicines } from '@/features/medicines/queries'
import type { DailySchedule } from './contract'
import { ScheduleForm } from './schedule-form'
import { type SchedulesRead } from './queries'

/**
 * First schedule setup for the `?schedule=ID` medicine (FE-647 A7, S5, S6). The form shows only
 * once Meddies knows the medicine has no schedule; `onSaved` runs after server confirmation.
 */
export function ScheduleSetupForm({
  schedulesRead: { schedules, loading, loadError, retry: retrySchedules },
  today,
  medicineId,
  onSaved,
}: {
  schedulesRead: SchedulesRead
  /** Istanbul date on the scheduling clock. */
  today: string
  medicineId: string
  onSaved?: (medicine: Medicine) => void
}) {
  const {
    medicines,
    loading: medicinesLoading,
    loadError: medicinesError,
    retry: retryMedicines,
  } = useMedicines()
  const [conflict, setConflict] = useState(false)
  const [savedId, setSavedId] = useState('')
  const medicine = medicines.find((item) => item.id === medicineId)
  const schedule = schedules.find((item) => item.medicineId === medicineId)
  const name = medicine?.label ?? 'This medicine'

  function saved(confirmed: DailySchedule) {
    setSavedId(confirmed.id)
    if (medicine) onSaved?.(medicine)
  }

  let body
  if (loading || medicinesLoading) body = <p role="status">Loading schedule…</p>
  else if ((medicinesError && !medicine) || loadError)
    body = (
      <Alert variant="destructive">
        <AlertTitle>{name} didn&apos;t load just now.</AlertTitle>
        <AlertDescription>
          Meddies needs to check its schedule first. Check your connection and try again.
        </AlertDescription>
        <Button
          variant="outline"
          className="mt-2 justify-self-start"
          onClick={() => {
            if (medicinesError) retryMedicines()
            if (loadError) retrySchedules()
          }}
        >
          Try again
        </Button>
      </Alert>
    )
  else if (!medicine)
    body = (
      <Alert>
        <InfoIcon aria-hidden="true" />
        <AlertTitle>This medicine isn&apos;t in your list.</AlertTitle>
        <Link
          href="/medications"
          className={buttonVariants({ variant: 'outline', className: 'mt-2 justify-self-start' })}
        >
          Back to Medications
        </Link>
      </Alert>
    )
  else if (schedule && schedule.id === savedId)
    body = <p role="status">Schedule saved for {medicine.label}.</p>
  else if (schedule || conflict)
    body = (
      <Alert role="status">
        <InfoIcon aria-hidden="true" />
        <AlertTitle>{medicine.label} already has a schedule.</AlertTitle>
        <AlertDescription>Schedules can&apos;t be changed here yet.</AlertDescription>
        <Link
          href={`/medications?medicine=${encodeURIComponent(medicine.id)}`}
          className={buttonVariants({ variant: 'outline', className: 'mt-2 justify-self-start' })}
        >
          View schedule
        </Link>
      </Alert>
    )
  else
    body = (
      <ScheduleForm
        key={medicine.id}
        medicine={medicine}
        today={today}
        onSaved={saved}
        onConflict={() => setConflict(true)}
      />
    )

  return (
    <section
      aria-labelledby="schedule-heading"
      className="flex flex-col gap-5 [overflow-wrap:anywhere]"
    >
      <header className="flex items-start gap-3.5">
        {medicine && <MedicationTile medicineId={medicine.id} />}
        <div className="flex min-w-0 flex-col gap-1">
          <p className="text-label font-extrabold tracking-eyebrow text-muted-foreground uppercase">
            Set schedule
          </p>
          <h2 id="schedule-heading" className="text-title font-extrabold">
            {medicine?.label ?? 'Medicine'}
          </h2>
          {medicine && (
            <p className="text-body-sm font-bold text-muted-foreground">
              {[medicine.strength, medicine.unit].filter(Boolean).join(' · ')}
            </p>
          )}
        </div>
      </header>
      {medicine && !schedule && !conflict && (
        <p className="text-body-sm text-muted-foreground">
          Times are Istanbul time. Doses start from the next time after you save. Earlier times
          today aren&apos;t added.
        </p>
      )}
      {body}
    </section>
  )
}
