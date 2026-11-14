'use client'

import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { LoadingSection } from '@/components/ui/skeleton'
import type { Medicine } from '@/features/medicines/contract'
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
import { returnToMedicationPage, showMedicationsView } from '@/features/medicines/medications-nav'
import { useMedicines } from '@/features/medicines/queries'
import { medicationsHref } from '@/features/medicines/routes'
import { discardSessionFormDraft } from '@/lib/session-drafts'
import { useKnownOffline } from '@/lib/use-known-offline'
import { istanbulDate, type DailySchedule } from './contract'
import { ScheduleSetupHeader } from './interval-setup-parts'
import { pausedOn } from './last-day'
import { scheduleKeys, type SchedulesRead } from './queries'
import { ResumeScheduleForm } from './resume-schedule-form'
import { useScheduleCommand } from './use-schedule-command'
import { useScheduleNow } from './use-schedule-now'

// Keyed by the paused version, so a newer version opens without an older draft.
export const resumeDraftKey = (scheduleId: string) => `schedule:resume-draft:${scheduleId}`

const leaveTo = (medicineId: string) =>
  showMedicationsView(medicationsHref({ mode: 'detail', medicineId }), 'replace')

/**
 * The `?resume=ID` screen: a paused Interval schedule asks for a new Anchor before it runs again
 * (233·A9 to A13, S5), a full-screen modal over the tab bar like Change schedule. Opens on the
 * paused version it was given; anything else returns to Medication detail. `onResumed` runs
 * after server confirmation, then the detail shows the running card.
 */
export function ScheduleResumeScreen({
  schedulesRead: { schedules, loading, loadError, retry: retrySchedules },
  now,
  medicineId,
  onResumed,
  serverEntry = false,
}: {
  schedulesRead: SchedulesRead
  now: string
  medicineId: string
  onResumed: (resumed: DailySchedule) => void
  serverEntry?: boolean
}) {
  const medicinesRead = useMedicines({ serverEntry })
  const { medicines, loading: medicinesLoading, loadError: medicinesError } = medicinesRead
  const liveNow = useScheduleNow(now)
  const today = istanbulDate(new Date(liveNow))
  // The version this screen opened on; a newer one surfaces as a stale resume (215·S2).
  const [opened, setOpened] = useState<{ current?: DailySchedule } | null>(null)
  const schedule = schedules.find((item) => item.medicineId === medicineId)
  if (!opened && !loading && !loadError) setOpened({ current: schedule })
  const current = opened?.current
  const resumable = Boolean(current && current.intervalHours != null && pausedOn(current, today))
  const medicine = medicines.find((item) => item.id === medicineId)
  const leaves = Boolean(opened) && !resumable && Boolean(medicine)
  useEffect(() => {
    // A Clock schedule resumes in one tap; a running or Ended one has nothing to resume.
    if (leaves) leaveTo(medicineId)
  }, [leaves, medicineId])
  if (medicinesLoading) return <MedicationSetupSkeleton />

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

  return (
    <section
      aria-labelledby="schedule-heading"
      data-covers-tab-bar
      className="fixed inset-0 z-40 overflow-y-auto bg-background [overflow-wrap:anywhere]"
    >
      <div className="mx-auto flex min-h-full max-w-2xl flex-col gap-5 px-5 pt-[calc(0.875rem+env(safe-area-inset-top,0px))]">
        {current && resumable ? (
          <ResumeBody
            medicine={medicine}
            current={current}
            today={today}
            now={liveNow}
            onResumed={onResumed}
          />
        ) : (
          <>
            <ScheduleSetupHeader
              label={medicine.label}
              subtitle="Resume schedule"
              onCancel={() => leaveTo(medicineId)}
            />
            <MedicinesRefreshAlert medicinesRead={medicinesRead} />
            {loadError ? (
              <ScheduleUnchecked name={medicine.label} onRetry={retrySchedules} />
            ) : (
              <LoadingSection label="Loading schedule">
                <ScheduleFormSkeleton />
              </LoadingSection>
            )}
          </>
        )}
      </div>
    </section>
  )
}

function ResumeBody({
  medicine,
  current,
  today,
  now,
  onResumed,
}: {
  medicine: Medicine
  current: DailySchedule
  today: string
  now: string
  onResumed: (resumed: DailySchedule) => void
}) {
  const client = useQueryClient()
  const offline = useKnownOffline()
  const draftKey = resumeDraftKey(current.id)
  const save = useScheduleCommand('resume', medicine, current, (resumed) => {
    discardSessionFormDraft(client, draftKey)
    onResumed(resumed)
    returnToMedicationPage(medicine.id)
  })
  return (
    <ResumeScheduleForm
      label={medicine.label}
      unit={medicine.unit}
      schedule={current}
      today={today}
      now={now}
      draftKey={draftKey}
      pending={save.pending}
      problem={save.problem}
      offline={offline}
      onSubmit={({ date, time }) => void save.save({ anchorDate: date, anchorTime: time })}
      // A pending resume carries on after leaving, as it does from any navigation.
      onCancel={() => leaveTo(medicine.id)}
      onReview={() => {
        save.clear()
        discardSessionFormDraft(client, draftKey)
        void client.invalidateQueries({ queryKey: scheduleKeys.all })
        leaveTo(medicine.id)
      }}
    />
  )
}
