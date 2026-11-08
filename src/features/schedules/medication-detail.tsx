'use client'

import type { ReactNode, Ref } from 'react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
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
  MedicationDetailSkeleton,
  ScheduleCardSkeleton,
} from '@/features/medicines/medications-skeleton'
import { MedicationsLink } from '@/features/medicines/medications-nav'
import type { MedicinesRead } from '@/features/medicines/queries'
import { medicationSetupHref } from '@/features/medicines/routes'
import { formatShortDay } from '@/lib/calendar-date'
import { istanbulDate } from './contract'
import type { SchedulesRead } from './queries'
import { weekdaySummary } from './weekdays'

/** The `?medicine=ID` page: 650 Fix 1's header above the schedule, and 647·D1 to D3. */
export function MedicationDetail({
  medicineId,
  medicinesRead,
  schedulesRead,
  now,
  notices,
  headingRef,
}: {
  medicineId: string
  medicinesRead: MedicinesRead
  schedulesRead: SchedulesRead
  now: string
  /** Confirmations from the save that led here, between the header and the schedule. */
  notices?: ReactNode
  headingRef?: Ref<HTMLHeadingElement>
}) {
  const { medicines, loading: medicinesLoading, loadError: medicinesError } = medicinesRead
  const { schedules, loading, loadError, refreshFailed, refreshing, retry } = schedulesRead
  if (medicinesLoading) return <MedicationDetailSkeleton />

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
              if (loadError) retry()
            }}
          />
        ) : (
          <MedicationNotFound />
        )}
      </div>
    )

  const schedule = schedules.find((item) => item.medicineId === medicineId)
  return (
    <div className="flex flex-col gap-5">
      <MedicationBackRow href={medicationsListHref}>Medications</MedicationBackRow>
      <MedicationIdentity medicine={medicine} headingRef={headingRef} />
      <MedicinesRefreshAlert medicinesRead={medicinesRead} />
      {refreshFailed && (
        <Alert role="status">
          <AlertDescription className="flex flex-col items-start gap-2 text-foreground">
            <p>Your schedules didn&apos;t update just now. Showing the last list that loaded.</p>
            <Button variant="outline" className="min-h-11" disabled={refreshing} onClick={retry}>
              {refreshing ? 'Retrying…' : 'Try loading schedules again'}
            </Button>
          </AlertDescription>
        </Alert>
      )}
      {notices}
      <section aria-labelledby="routine-heading" className="space-y-3 [overflow-wrap:anywhere]">
        <h2 id="routine-heading" className="sr-only">
          Schedule
        </h2>
        {loading ? (
          <LoadingSection label="Loading schedule">
            <ScheduleCardSkeleton />
          </LoadingSection>
        ) : loadError ? (
          <ScheduleUnchecked name={medicine.label} onRetry={retry} />
        ) : schedule ? (
          <div className="space-y-2 rounded-xl border bg-card p-4">
            <p>
              {weekdaySummary(schedule.weekdays, 'long')} at{' '}
              {schedule.times.map((slot) => `${slot.time} (${slot.quantity})`).join(', ')}
            </p>
            <p className="text-sm text-muted-foreground">
              Starts {formatShortDay(schedule.startDate, istanbulDate(new Date(now)))}.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            <p>No schedule yet.</p>
            <MedicationsLink
              className="inline-flex min-h-11 items-center rounded-md bg-primary px-4 text-primary-foreground"
              href={medicationSetupHref(medicineId)}
            >
              Set schedule
            </MedicationsLink>
          </div>
        )}
      </section>
      <p className="text-label text-muted-foreground">
        Details and schedules can&apos;t be changed here yet.
      </p>
    </div>
  )
}
