'use client'

import { useState } from 'react'
import { MedicationsLink } from '@/features/medicines/medications-nav'
import { medicationsHref } from '@/features/medicines/routes'
import { InfoIcon } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { buttonVariants } from '@/components/ui/button'
import type { Medicine } from '@/features/medicines/contract'
import { LoadingSection } from '@/components/ui/skeleton'
import {
  MedicationBackRow,
  MedicationIdentity,
  MedicationLoadFailed,
  MedicationNotFound,
  medicationsListHref,
  MedicinesRefreshAlert,
  ScheduleUnchecked,
} from '@/features/medicines/medication-sub-screen'
import {
  MedicationSetupSkeleton,
  ScheduleFormSkeleton,
} from '@/features/medicines/medications-skeleton'
import { useMedicines } from '@/features/medicines/queries'
import type { DailySchedule } from './contract'
import { ScheduleForm } from './schedule-form'
import { type SchedulesRead } from './queries'

/**
 * First schedule setup for the `?schedule=ID` medicine (FE-647 A7, S5, S6), under 650 Fix 1's
 * header. The form shows only once Meddies knows the medicine has no schedule; `onSaved` runs after server confirmation.
 */
export function ScheduleSetupForm({
  schedulesRead: { schedules, loading, loadError, retry: retrySchedules },
  today,
  medicineId,
  onSaved,
  serverEntry = false,
}: {
  schedulesRead: SchedulesRead
  /** Istanbul date on the scheduling clock. */
  today: string
  medicineId: string
  onSaved?: (medicine: Medicine) => void
  serverEntry?: boolean
}) {
  const medicinesRead = useMedicines({ serverEntry })
  const { medicines, loading: medicinesLoading, loadError: medicinesError } = medicinesRead
  const [conflict, setConflict] = useState(false)
  const [savedId, setSavedId] = useState('')
  if (medicinesLoading) return <MedicationSetupSkeleton />

  const medicine = medicines.find((item) => item.id === medicineId)
  if (!medicine)
    return (
      <div className="flex flex-col gap-5">
        <MedicationBackRow href={medicationsListHref}>Medications</MedicationBackRow>
        <MedicinesRefreshAlert medicinesRead={medicinesRead} />
        {medicinesError ? (
          <MedicationLoadFailed
            onRetry={() => {
              medicinesRead.retry()
              if (loadError) retrySchedules()
            }}
          />
        ) : (
          <MedicationNotFound />
        )}
      </div>
    )

  const schedule = schedules.find((item) => item.medicineId === medicineId)

  function saved(confirmed: DailySchedule) {
    setSavedId(confirmed.id)
    if (medicine) onSaved?.(medicine)
  }

  let body
  if (loading)
    body = (
      <LoadingSection label="Loading schedule">
        <ScheduleFormSkeleton />
      </LoadingSection>
    )
  else if (loadError) body = <ScheduleUnchecked name={medicine.label} onRetry={retrySchedules} />
  else if (schedule && schedule.id === savedId)
    body = <p role="status">Schedule saved for {medicine.label}.</p>
  else if (schedule || conflict)
    body = (
      <Alert role="status">
        <InfoIcon aria-hidden="true" />
        <AlertTitle>{medicine.label} already has a schedule.</AlertTitle>
        <AlertDescription>Schedules can&apos;t be changed here yet.</AlertDescription>
        <MedicationsLink
          href={medicationsHref({ mode: 'detail', medicineId: medicine.id })}
          className={buttonVariants({ variant: 'outline', className: 'mt-2 justify-self-start' })}
        >
          View schedule
        </MedicationsLink>
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
      <MedicationBackRow href={medicationsHref({ mode: 'detail', medicineId: medicine.id })}>
        {medicine.label}
      </MedicationBackRow>
      <MedicationIdentity medicine={medicine} eyebrow="Set schedule" headingId="schedule-heading" />
      <MedicinesRefreshAlert medicinesRead={medicinesRead} />
      {!loading && !loadError && !schedule && !conflict && (
        <p className="text-body-sm text-muted-foreground">
          Times are Istanbul time. Doses start from the next time after you save. Earlier times
          today aren&apos;t added.
        </p>
      )}
      {body}
    </section>
  )
}
