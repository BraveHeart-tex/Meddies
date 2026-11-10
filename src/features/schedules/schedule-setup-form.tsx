'use client'

import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { MedicationsLink, showMedicationsView } from '@/features/medicines/medications-nav'
import { medicationsHref } from '@/features/medicines/routes'
import { InfoIcon } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { buttonVariants } from '@/components/ui/button'
import type { Medicine } from '@/features/medicines/contract'
import { LoadingSection } from '@/components/ui/skeleton'
import {
  MedicationBackRow,
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
import { cn } from '@/lib/utils'
import type { DailySchedule } from './contract'
import { ScheduleDiscardDrawer, ScheduleSetupHeader } from './interval-setup-parts'
import { scheduleKeys, type SchedulesRead } from './queries'
import { ScheduleKindForms } from './schedule-kind-forms'
import { discardScheduleDrafts, hasScheduleEdits, scheduleDraftBase } from './schedule-setup-drafts'
import { useScheduleAttempt } from './use-schedule-save'

/**
 * Schedule setup for the `?schedule=ID` medicine, a full-screen modal that covers the tab bar
 * (764·C0). With no schedule it sets the first one (FE-647 A7, S5, S6); otherwise it changes the
 * current Schedule version (767·A2 to S2). The form shows only once Meddies knows which;
 * `onSaved` runs after server confirmation.
 */
export function ScheduleSetupForm({
  schedulesRead: { schedules, loading, loadError, retry: retrySchedules },
  today,
  now,
  medicineId,
  onSaved,
  serverEntry = false,
}: {
  schedulesRead: SchedulesRead
  /** Istanbul date on the scheduling clock. */
  today: string
  /** The server scheduling time the setup's dose preview counts from. */
  now: string
  medicineId: string
  onSaved?: (medicine: Medicine) => void
  serverEntry?: boolean
}) {
  const medicinesRead = useMedicines({ serverEntry })
  const { medicines, loading: medicinesLoading, loadError: medicinesError } = medicinesRead
  const [conflict, setConflict] = useState(false)
  const [savedId, setSavedId] = useState('')
  const [discarding, setDiscarding] = useState(false)
  // The version this screen opened on. A newer one from elsewhere surfaces as a conflict when
  // saving (767·S2), and this screen's own first save never turns it into a change.
  const [opened, setOpened] = useState<{ current?: DailySchedule } | null>(null)
  const schedule = schedules.find((item) => item.medicineId === medicineId)
  if (!opened && !loading && !loadError) setOpened({ current: schedule })
  const current = opened?.current
  const client = useQueryClient()
  const attempt = useScheduleAttempt(medicineId, current)
  const base = scheduleDraftBase(medicineId, current)
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

  const showsForm =
    Boolean(opened) &&
    !loading &&
    !loadError &&
    !conflict &&
    schedule?.id !== savedId &&
    (Boolean(current) || !schedule)

  function saved(confirmed: DailySchedule) {
    setSavedId(confirmed.id)
    if (medicine) onSaved?.(medicine)
  }

  function leave() {
    showMedicationsView(medicationsHref({ mode: 'detail', medicineId }), 'replace')
  }

  function cancel() {
    // A pending save carries on after leaving, as it does from any navigation.
    if (showsForm && !attempt.pending && hasScheduleEdits(client, base, Boolean(current)))
      setDiscarding(true)
    else leave()
  }

  function discard() {
    attempt.clear()
    discardScheduleDrafts(client, base)
    setDiscarding(false)
    leave()
  }

  function review() {
    attempt.clear()
    discardScheduleDrafts(client, base)
    void client.invalidateQueries({ queryKey: scheduleKeys.all })
    leave()
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
  else if (conflict || (schedule && !current))
    body = (
      <Alert role="status">
        <InfoIcon aria-hidden="true" />
        <AlertTitle>{medicine.label} already has a schedule.</AlertTitle>
        <AlertDescription>Open it to review or change it.</AlertDescription>
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
      <ScheduleKindForms
        key={medicine.id}
        medicine={medicine}
        today={today}
        serverNow={now}
        onSaved={saved}
        onConflict={() => setConflict(true)}
        change={current && { current, onReview: review }}
      />
    )

  return (
    <section
      aria-labelledby="schedule-heading"
      data-covers-tab-bar
      className="fixed inset-0 z-40 overflow-y-auto bg-background [overflow-wrap:anywhere]"
    >
      <div
        className={cn(
          'mx-auto flex min-h-full max-w-2xl flex-col gap-5 px-5 pt-[calc(0.875rem+env(safe-area-inset-top,0px))]',
          // The form's pinned actions bring their own bottom inset.
          !showsForm && 'pb-[calc(1rem+env(safe-area-inset-bottom,0px))]',
        )}
      >
        <ScheduleSetupHeader
          label={medicine.label}
          subtitle={current ? 'Change schedule' : 'Set schedule'}
          onCancel={cancel}
        />
        <MedicinesRefreshAlert medicinesRead={medicinesRead} />
        {body}
      </div>
      <ScheduleDiscardDrawer
        open={discarding}
        change={Boolean(current)}
        onKeepEditing={() => setDiscarding(false)}
        onDiscard={discard}
      />
    </section>
  )
}
