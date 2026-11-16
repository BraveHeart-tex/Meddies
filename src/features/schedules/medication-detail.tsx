'use client'

import { Archive, Clock, History, Pencil } from 'lucide-react'
import { Item, ItemContent, ItemDescription, ItemGroup, ItemTitle } from '@/components/ui/item'
import { useState, type ReactNode, type Ref } from 'react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Card, CardHeader, CardTitle } from '@/components/ui/card'
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
import type { Medicine } from '@/features/medicines/contract'
import type { MedicinesRead } from '@/features/medicines/queries'
import { medicationRecordHref, medicationSetupHref } from '@/features/medicines/routes'
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
import { LogDose } from '../unscheduled-doses/log-dose'
import { isArchived } from '@/features/medicines/contract'
import { ArchivedMedicationDetail } from '@/features/medicines/archived-medications'

/** After the server confirms a pause (233·A4). */
export function PausedScheduleAlert({ label }: { label: string }) {
  return (
    <Alert role="status" aria-label="Paused schedule">
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
    <Alert role="status" aria-label="Resumed schedule">
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
 * The `?medicine=ID` page (238·A3): the Back row and identity header above the schedule, and Change
 * schedule, Pause and Stop schedule under it, or Resume and Stop schedule once paused (215·A1,
 * S3, S4; 227·A13 to A16; 233·A1 to A8, S3, S4). A running schedule shows its Last day, a paused
 * one the day it paused, an Ended one the day it ended (227·A13, A14, A17; 233·A4, A5). Log a
 * dose sits under the schedule for any medication (241·A1, A2).
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
  onArchiveRequested,
  onDeleteRequested,
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
  onArchiveRequested?: (medicine: Medicine) => void
  onDeleteRequested?: (medicine: Medicine) => void
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

  // An Archived medicine opens read-only, never offering a new dose (#330).
  if (isArchived(medicine))
    return (
      <ArchivedMedicationDetail
        medicine={medicine}
        medicinesRead={medicinesRead}
        headingRef={headingRef}
      />
    )

  const schedule = schedules.find((item) => item.medicineId === medicineId)
  const today = istanbulDate(new Date(now))
  // A Last day passes at midnight on the live clock.
  const liveToday = istanbulDate(new Date(liveNow))
  const ended = schedule ? endedOn(schedule, liveToday) : null
  const paused = schedule ? pausedOn(schedule, liveToday) : null
  // Only a loaded read can say there is no schedule.
  const unscheduled = !loading && !loadError && !schedule
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
            <p>Couldn’t update schedules. Showing previously loaded details.</p>
            <Button variant="outline" className="min-h-11" disabled={refreshing} onClick={retry}>
              {refreshing ? 'Retrying…' : 'Try again'}
            </Button>
          </AlertDescription>
        </Alert>
      )}
      {(justSaved || justScheduled) && (
        <Alert role="status" aria-label={justSaved ? 'Saved medication' : 'Saved schedule'}>
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
        <Alert role="status" aria-label="Stopped schedule">
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
          // A complete record for occasional use, not unfinished setup (#275 record rules).
          <Card>
            <CardHeader>
              <CardTitle>No schedule</CardTitle>
            </CardHeader>
          </Card>
        )}
      </section>
      <LogDose medicine={medicine} primary={unscheduled} />
      {unscheduled && (
        <>
          <MedicationsLink
            className={buttonVariants({ size: 'lg', variant: 'outline', className: 'w-full' })}
            href={medicationSetupHref(medicineId)}
          >
            Set schedule
          </MedicationsLink>
          {actions}
        </>
      )}
      <section className="flex flex-col gap-3" aria-label="Medication details">
        <h2 className="text-heading">Medication details</h2>
        <ItemGroup>
          <Item
            variant="card"
            render={
              <MedicationsLink
                aria-label="Fix a mistake"
                href={medicationRecordHref(medicine.id, 'fix', medicine.currentStrengthRevisionId)}
              />
            }
          >
            <ItemContent>
              <ItemTitle>Fix a mistake</ItemTitle>
            </ItemContent>
            <Pencil aria-hidden="true" className="size-5 shrink-0 text-muted-foreground" />
          </Item>
          <Item
            variant="card"
            render={
              <MedicationsLink
                aria-label="Change strength"
                href={medicationRecordHref(medicine.id, 'strength')}
              />
            }
          >
            <ItemContent>
              <ItemTitle>Change strength</ItemTitle>
              <ItemDescription>Earlier doses keep their saved strength.</ItemDescription>
            </ItemContent>
            <Clock aria-hidden="true" className="size-5 shrink-0 text-muted-foreground" />
          </Item>
        </ItemGroup>
        <ItemGroup>
          <Item
            variant="card"
            render={
              <MedicationsLink
                aria-label="Strength history"
                href={medicationRecordHref(medicine.id, 'history')}
              />
            }
          >
            <ItemContent>
              <ItemTitle>Strength history</ItemTitle>
            </ItemContent>
            <History aria-hidden="true" className="size-5 shrink-0 text-muted-foreground" />
          </Item>
        </ItemGroup>
      </section>
      {typeof medicine.revision === 'number' && onArchiveRequested && (
        <Button
          id={`archive-medicine-${medicine.id}`}
          variant="ghost"
          size="lg"
          onClick={() => onArchiveRequested(medicine)}
        >
          <Archive data-icon="inline-start" />
          Archive medication
        </Button>
      )}
      {medicine.everHadSchedule === false &&
        medicine.everHadDose === false &&
        onDeleteRequested && (
          <Button
            id={`delete-medicine-${medicine.id}`}
            variant="destructive"
            size="lg"
            onClick={() => onDeleteRequested(medicine)}
          >
            Delete medication
          </Button>
        )}
    </div>
  )
}
