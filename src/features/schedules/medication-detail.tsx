'use client'

import { useState, type ReactNode, type Ref } from 'react'
import { Clock } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { EmptyState } from '@/components/ui/empty-state'
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
import { istanbulDate, type DailySchedule } from './contract'
import { ClockScheduleCard } from './clock-schedule-card'
import { intervalAnchor } from './interval-preview'
import { IntervalScheduleCard } from './interval-schedule-card'
import { ScheduleActions } from './schedule-actions'
import { endedOn, pausedOn } from './last-day'
import { doseWhen, firstDoseAfterResume } from './resume'
import type { SchedulesRead } from './queries'
import { useScheduleNow } from './use-schedule-now'

/** After the server confirms a pause (233·A4). */
export function PausedScheduleAlert({ label }: { label: string }) {
  return (
    <Alert variant="confirmation" role="status" aria-label="Paused schedule">
      <AlertTitle>Schedule paused for {label}.</AlertTitle>
      <AlertDescription>No doses expected until you resume.</AlertDescription>
    </Alert>
  )
}

/** After the server confirms a resume: the next dose, or none left (233·A7, A8, A13). */
export function ResumedScheduleAlert({
  label,
  schedule,
}: {
  label: string
  schedule: DailySchedule
}) {
  const today = istanbulDate(new Date(schedule.confirmedAt))
  const next = firstDoseAfterResume(schedule, schedule.confirmedAt)
  return (
    <Alert variant="confirmation" role="status" aria-label="Resumed schedule">
      <AlertTitle>Schedule resumed for {label}.</AlertTitle>
      <AlertDescription>
        {next
          ? `Next dose: ${doseWhen(next, today)}.`
          : `No more doses are due.${schedule.endDate === today ? ' Today is its Last day.' : ''}`}
      </AlertDescription>
    </Alert>
  )
}

/**
 * The `?medicine=ID` page: 110 Fix 1's header above the schedule, 107·D1 to D3, and Change
 * schedule, Pause and Stop schedule under it, or Resume and Stop schedule once paused (215·A1,
 * S3, S4; 227·A13 to A16; 233·A1 to A8, S3, S4). A running schedule shows its Last day, a paused
 * one the day it paused, an Ended one the day it ended (227·A13, A14, A17; 233·A4, A5).
 */
export function MedicationDetail({
  medicineId,
  medicinesRead,
  schedulesRead,
  now,
  actions,
  justSaved = false,
  justScheduled = false,
  resumed = null,
  onResumed,
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
  /** The resume this panel confirmed, here or on the Resume schedule screen. */
  resumed?: DailySchedule | null
  onResumed: (resumed: DailySchedule) => void
  headingRef?: Ref<HTMLHeadingElement>
}) {
  const { medicines, loading: medicinesLoading, loadError: medicinesError } = medicinesRead
  const { schedules, loading, loadError, refreshFailed, refreshing, retry } = schedulesRead
  const liveNow = useScheduleNow(now)
  // The stop this screen confirmed, until the schedule changes again (227·A16).
  const [stopped, setStopped] = useState<DailySchedule | null>(null)
  // The pause this screen confirmed, until the schedule changes again (233·A4).
  const [justPaused, setJustPaused] = useState<DailySchedule | null>(null)
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
  // A Last day passes at midnight on the live clock.
  const liveToday = istanbulDate(new Date(liveNow))
  const ended = schedule ? endedOn(schedule, liveToday) : null
  const paused = schedule ? pausedOn(schedule, liveToday) : null
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
              {schedule?.basedOnId ? 'Next dose' : 'First dose'}:{' '}
              {istanbulDate(new Date(first.dueAt)) === today
                ? 'today'
                : formatShortDay(first.dueAt, today)}{' '}
              at {formatTime(first.dueAt)}.
            </AlertDescription>
          )}
        </Alert>
      )}
      {stopped?.stoppedAt && schedule?.id === stopped.id && (
        <Alert variant="confirmation" role="status" aria-label="Stopped schedule">
          <AlertTitle>Schedule stopped for {medicine.label}.</AlertTitle>
          <AlertDescription>
            No more doses after {formatTime(stopped.stoppedAt)} today.
          </AlertDescription>
        </Alert>
      )}
      {justPaused && paused && schedule?.id === justPaused.id && (
        <PausedScheduleAlert label={medicine.label} />
      )}
      {resumed && schedule?.id === resumed.id && !ended && (
        <ResumedScheduleAlert label={medicine.label} schedule={resumed} />
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
          <>
            {schedule.intervalHours != null ? (
              <IntervalScheduleCard
                hours={schedule.intervalHours}
                anchor={intervalAnchor(schedule)}
                quantity={schedule.times[0].quantity}
                unit={medicine.unit}
                now={liveNow}
                lastDay={schedule.endDate}
                ended={ended}
                paused={paused}
              />
            ) : (
              <ClockScheduleCard schedule={schedule} unit={medicine.unit} today={liveToday} />
            )}
            <ScheduleActions
              medicine={medicine}
              schedule={schedule}
              ended={Boolean(ended)}
              paused={Boolean(paused)}
              onStopped={setStopped}
              onPaused={setJustPaused}
              onResumed={onResumed}
            />
          </>
        ) : (
          <EmptyState
            icon={Clock}
            title="No schedule yet"
            body={
              <>
                {justSaved && 'Set the days and times you take it, or do it later from this page. '}
                Today won&apos;t list {medicine.label} until it has a schedule.
              </>
            }
            action={
              <>
                <MedicationsLink
                  className={buttonVariants({ size: 'lg' })}
                  href={medicationSetupHref(medicineId)}
                >
                  Set schedule
                </MedicationsLink>
                {actions}
              </>
            }
          />
        )}
      </section>
      <p className="text-label text-muted-foreground">Details can&apos;t be changed here yet.</p>
    </div>
  )
}
