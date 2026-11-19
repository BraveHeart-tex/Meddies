'use client'

import { CalendarDays, SlidersHorizontal } from 'lucide-react'
import { Item, ItemContent, ItemDescription, ItemTitle } from '@/components/ui/item'
import type { ReactNode, Ref } from 'react'
import { Alert, AlertDescription } from '@/components/ui/alert'
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
import {
  MedicationInsetGroup,
  MedicationInsetRow,
} from '@/features/medicines/medication-inset-list'
import {
  medicationManageHref,
  medicationRecordHref,
  medicationSetupHref,
} from '@/features/medicines/routes'
import { currentSchedule, istanbulDate } from './contract'
import { ClockScheduleCard } from './clock-schedule-card'
import { intervalAnchor } from './interval-preview'
import { IntervalScheduleCard } from './interval-schedule-card'
import { MedicationManage } from './medication-manage'
import { ResumeScheduleAction } from './schedule-actions'
import { endedOn, pausedOn } from './last-day'
import type { SchedulesRead } from './queries'
import { useScheduleNow } from './use-schedule-now'
import { LogDose } from '../unscheduled-doses/log-dose'
import { isArchived } from '@/features/medicines/contract'
import { ArchivedMedicationDetail } from '@/features/medicines/archived-medications'
import { MedicineStock } from '@/features/medicines/medicine-stock'

/**
 * A failed refresh of the medication, its schedules or both: one notice naming the medication, and
 * one Try again that retries both reads, so the two never stack (#406).
 */
function MedicationRefreshAlert({
  name,
  failed,
  refreshing,
  onRetry,
}: {
  name: string
  failed: boolean
  refreshing: boolean
  onRetry: () => void
}) {
  if (!failed) return null
  return (
    <Alert role="status">
      <AlertDescription className="flex flex-col items-start gap-2 text-foreground">
        <p>{`Couldn’t update ${name}. Showing previously loaded details.`}</p>
        <Button variant="outline" className="min-h-11" disabled={refreshing} onClick={onRetry}>
          {refreshing ? 'Retrying…' : 'Try again'}
        </Button>
      </AlertDescription>
    </Alert>
  )
}

/**
 * The `?medicine=ID` page (238·A3): a summary. The Back row and identity header above the
 * read-only schedule card, Resume under it while paused, then Log a dose (241·A1, A2),
 * the Stock section (#392) and Dose history, then Manage medication. A running schedule shows its
 * Last day, a paused one the day it paused, an Ended one the day it ended (227·A13, A14, A17;
 * 233·A4, A5). `manage` shows the Manage sub-screen (403·B14) instead, where every other change
 * lives. Loading holds the Back row, the identity and one card-height placeholder; a failed
 * schedule read replaces only the card; names and strengths wrap at word boundaries (#406).
 */
export function MedicationDetail({
  medicineId,
  medicinesRead,
  schedulesRead,
  now,
  actions,
  headingRef,
  manage = false,
  onArchiveRequested,
  onRestoreRequested,
  onDeleteRequested,
}: {
  medicineId: string
  medicinesRead: MedicinesRead
  schedulesRead: SchedulesRead
  now: string
  /** Extra actions for the transient medication-save handoff. */
  actions?: ReactNode
  onArchiveRequested?: (medicine: Medicine) => void
  onRestoreRequested?: (medicine: Medicine) => void
  onDeleteRequested?: (medicine: Medicine) => void
  headingRef?: Ref<HTMLHeadingElement>
  /** `?medicine=ID&manage`: the Manage sub-screen. */
  manage?: boolean
}) {
  const { medicines, loading: medicinesLoading, loadError: medicinesError } = medicinesRead
  const { schedules, loading, loadError, refreshFailed, refreshing, retry } = schedulesRead
  const liveNow = useScheduleNow(now)
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
        onRestoreRequested={onRestoreRequested}
      />
    )

  const schedule = currentSchedule(schedules, medicineId)
  // A Last day passes at midnight on the live clock.
  const liveToday = istanbulDate(new Date(liveNow))
  const ended = schedule ? endedOn(schedule, liveToday) : null
  const paused = schedule ? pausedOn(schedule, liveToday) : null
  // Only a loaded read can say there is no schedule.
  const unscheduled = !loading && !loadError && !schedule
  const refreshAlerts = (
    <MedicationRefreshAlert
      name={medicine.label}
      failed={medicinesRead.refreshFailed || refreshFailed}
      refreshing={medicinesRead.refreshing || refreshing}
      onRetry={() => {
        medicinesRead.retry()
        retry()
      }}
    />
  )
  if (manage)
    return (
      <MedicationManage
        medicine={medicine}
        schedule={schedule}
        ended={Boolean(ended)}
        paused={Boolean(paused)}
        unscheduled={unscheduled}
        loading={loading}
        loadError={Boolean(loadError)}
        onRetry={retry}
        refreshAlerts={refreshAlerts}
        headingRef={headingRef}
        onArchiveRequested={onArchiveRequested}
        onDeleteRequested={onDeleteRequested}
      />
    )
  return (
    <div className="flex flex-col gap-5 [overflow-wrap:break-word]">
      <MedicationBackRow href={medicationsListHref}>Medications</MedicationBackRow>
      <MedicationIdentity medicine={medicine} headingRef={headingRef} />
      {refreshAlerts}
      {/* The card's own title names the schedule, so no heading repeats it. */}
      <div className="flex flex-col gap-3">
        {loading ? (
          <LoadingSection label="Loading schedule">
            <ScheduleCardSkeleton />
          </LoadingSection>
        ) : loadError ? (
          <ScheduleUnchecked name={medicine.label} onRetry={retry} />
        ) : schedule ? (
          schedule.intervalHours != null ? (
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
          )
        ) : (
          // A complete record for occasional use, not unfinished setup (#275 record rules).
          <Item variant="card">
            <ItemContent>
              <ItemTitle>No schedule</ItemTitle>
              <ItemDescription>Log a dose whenever you take one.</ItemDescription>
            </ItemContent>
          </Item>
        )}
      </div>
      {schedule && !loading && !loadError && (
        <ResumeScheduleAction medicine={medicine} schedule={schedule} paused={Boolean(paused)} />
      )}
      <LogDose
        medicine={medicine}
        variant={unscheduled ? 'default' : paused ? 'outline' : 'soft'}
      />
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
      <MedicineStock medicine={medicine} />
      <MedicationInsetGroup>
        <MedicationInsetRow
          icon={CalendarDays}
          label="Dose history"
          href={medicationRecordHref(medicine.id, 'doses')}
        />
      </MedicationInsetGroup>
      <MedicationInsetGroup>
        <MedicationInsetRow
          icon={SlidersHorizontal}
          label="Manage medication"
          description="Schedule and details"
          href={medicationManageHref(medicine.id)}
        />
      </MedicationInsetGroup>
    </div>
  )
}
