'use client'

import { useState } from 'react'
import Link from 'next/link'
import { InfoIcon } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button, buttonVariants } from '@/components/ui/button'
import type { Medicine } from '@/features/medicines/contract'
import { MedicationTile } from '@/features/medicines/medication-tile'
import { istanbulDate, type DailySchedule } from './contract'
import { ScheduleForm } from './schedule-form'
import type { ScheduleSnapshot } from './use-schedule-snapshot'

/**
 * First schedule setup for the `?schedule=ID` medicine (FE-647 A7, S5, S6). The form shows only
 * once Meddies knows the medicine has no schedule; `onSaved` runs after server confirmation.
 */
export function ScheduleSetupForm({
  snapshot: { schedules, now, loading, loadError, retry: retrySchedules, insertSchedule },
  medicineId,
  medicines,
  medicinesLoading,
  medicinesError,
  retryMedicines,
  onSaved,
}: {
  snapshot: ScheduleSnapshot
  medicineId: string
  medicines: Medicine[]
  medicinesLoading: boolean
  medicinesError: boolean
  retryMedicines: () => void
  onSaved?: (medicine: Medicine) => void
}) {
  const [conflict, setConflict] = useState(false)
  const [savedId, setSavedId] = useState('')
  const medicine = medicines.find((item) => item.id === medicineId)
  const schedule = schedules.find((item) => item.medicineId === medicineId)
  const name = medicine?.label ?? 'This medicine'

  function saved(confirmed: DailySchedule) {
    setSavedId(confirmed.id)
    void insertSchedule(confirmed)
    if (medicine) onSaved?.(medicine)
  }

  let body
  if (loading || medicinesLoading) body = <p role="status">Loading schedule setup...</p>
  else if ((medicinesError && !medicine) || loadError)
    body = (
      <Alert variant="destructive">
        <AlertTitle>{name} couldn&apos;t be loaded.</AlertTitle>
        <AlertDescription>
          Meddies needs to check its current schedule first. Connect and retry.
        </AlertDescription>
        <Button
          variant="outline"
          className="mt-2 justify-self-start"
          onClick={() => {
            if (medicinesError) retryMedicines()
            if (loadError) retrySchedules()
          }}
        >
          Retry
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
        today={istanbulDate(new Date(now))}
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
          Times are Istanbul time. Doses start from the next time after you save; earlier times
          today are not added.
        </p>
      )}
      {body}
    </section>
  )
}
