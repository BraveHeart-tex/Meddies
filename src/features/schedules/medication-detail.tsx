'use client'

import type { ReactNode, Ref } from 'react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { quantityLabel } from '@/lib/dose-quantity'
import { scheduleToday } from './occurrences'
import { Button, buttonVariants } from '@/components/ui/button'
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
import { formatShortDay, formatTime } from '@/lib/calendar-date'
import { istanbulDate } from './contract'
import type { SchedulesRead } from './queries'
import { weekdaySummary } from './weekdays'

/** The `?medicine=ID` page: 650 Fix 1's header above the schedule, and 647·D1 to D3. */
export function MedicationDetail({
  medicineId,
  medicinesRead,
  schedulesRead,
  now,
  actions,
  justSaved = false,
  justScheduled = false,
  headingRef,
}: {
  medicineId: string
  medicinesRead: MedicinesRead
  schedulesRead: SchedulesRead
  now: string
  /** Extra actions for the transient medication-save handoff. */
  actions?: ReactNode
  justSaved?: boolean
  justScheduled?: boolean
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
  const today = istanbulDate(new Date(now))
  // Anchor to the server's save instant, so earlier times today never become the first dose.
  const first =
    schedule && justScheduled
      ? scheduleToday([schedule], new Date(schedule.confirmedAt), []).next
      : null
  return (
    <div className="flex flex-col gap-5 [overflow-wrap:anywhere]">
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
      {(justSaved || justScheduled) && (
        <Alert
          variant="confirmation"
          role="status"
          aria-label={justSaved ? 'Saved medication' : 'Saved schedule'}
        >
          <AlertTitle>
            {justSaved ? `${medicine.label} saved.` : `Schedule saved for ${medicine.label}.`}
          </AlertTitle>
          {first && (
            <AlertDescription>
              First dose:{' '}
              {istanbulDate(new Date(first.dueAt)) === today
                ? 'today'
                : formatShortDay(first.dueAt, today)}{' '}
              at {formatTime(first.dueAt)}.
            </AlertDescription>
          )}
        </Alert>
      )}
      <section
        aria-labelledby="routine-heading"
        className="flex flex-col gap-3 [overflow-wrap:anywhere]"
      >
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
          <Card>
            <CardHeader className="flex flex-row flex-wrap items-baseline justify-between gap-2">
              <CardTitle>Schedule</CardTitle>
              <CardDescription>{weekdaySummary(schedule.weekdays, 'long')}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <ul className="divide-y">
                {schedule.times.map((slot) => (
                  <li key={slot.time} className="flex flex-wrap justify-between gap-2 py-3">
                    <span className="text-heading font-extrabold">{slot.time}</span>
                    <span className="text-body-sm">
                      {quantityLabel(slot.quantity, medicine.unit)}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="text-body-sm text-muted-foreground">
                {schedule.startDate > today ? 'Starts' : 'Started'}{' '}
                {formatShortDay(schedule.startDate, today)}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="flex flex-col gap-5">
            <Card variant="dashed">
              <CardHeader>
                <CardTitle>No schedule yet</CardTitle>
                <CardDescription>
                  {justSaved &&
                    'Set the days and times you take it, or do it later from this page. '}
                  Today won&apos;t list {medicine.label} until it has a schedule.
                </CardDescription>
              </CardHeader>
            </Card>
            <div className="flex flex-col gap-2.5">
              <MedicationsLink
                className={buttonVariants({ size: 'lg' })}
                href={medicationSetupHref(medicineId)}
              >
                Set schedule
              </MedicationsLink>
              {actions}
            </div>
          </div>
        )}
      </section>
      <p className="text-label text-muted-foreground">
        Details and schedules can&apos;t be changed here yet.
      </p>
    </div>
  )
}
