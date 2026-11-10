'use client'

import type { ReactNode } from 'react'
import Link from 'next/link'
import { AppHeader } from '@/components/layout/app-header'
import { AppShell } from '@/components/layout/app-shell'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { buttonVariants } from '@/components/ui/button'
import type { Medicine } from '@/features/medicines/contract'
import { MedicationBackRow, MedicationIdentity } from '@/features/medicines/medication-sub-screen'
import { medicationsHref } from '@/features/medicines/routes'
import { ClockScheduleCard } from '@/features/schedules/clock-schedule-card'
import type { DailySchedule } from '@/features/schedules/contract'
import { intervalAnchor } from '@/features/schedules/interval-preview'
import { IntervalScheduleCard } from '@/features/schedules/interval-schedule-card'
import { endedOn as endedDay } from '@/features/schedules/last-day'
import { MedicationRoutineGroups } from '@/features/schedules/medication-routine-groups'
import { SchedulingClockProvider } from '@/features/schedules/scheduling-clock'
import { formatTime } from '@/lib/calendar-date'
import { cn } from '@/lib/utils'
import { CLOCK_STARTED, EVERY_DAY } from './edit-lab-model'
import { magnesium, NOW, TODAY } from './lab-fixtures'
import { ENDED_ON, type LastDaySchedule } from './last-day-model'
import { StopScheduleDrawer, type StopState } from './last-day-parts'

/**
 * The lab schedule as a Schedule version: stopped at NOW when it ended today, or Changed today
 * when restarted.
 */
function labVersion(
  schedule: LastDaySchedule,
  { endedOn, changed = false }: { endedOn?: string; changed?: boolean },
): DailySchedule {
  const shape =
    schedule.kind === 'times'
      ? {
          startDate: CLOCK_STARTED,
          weekdays: schedule.clock.weekdays,
          times: schedule.clock.times.map((slot) => ({
            time: slot.time,
            quantity: Number(slot.quantity),
          })),
          intervalHours: null,
        }
      : {
          startDate: schedule.interval.date,
          weekdays: EVERY_DAY,
          times: [{ time: schedule.interval.time, quantity: Number(schedule.interval.quantity) }],
          intervalHours: Number(schedule.interval.hours),
        }
  return {
    id: '11111111-1111-4111-8111-1111111111a1',
    medicineId: magnesium.id,
    ...shape,
    ...(changed ? { startDate: TODAY, basedOnId: '11111111-1111-4111-8111-1111111111a0' } : {}),
    endDate: schedule.lastDay,
    confirmedAt: changed ? NOW : '2026-11-01T18:00:00.000Z',
    stoppedAt: endedOn === TODAY ? NOW : null,
  }
}

/** Change schedule and Stop schedule side by side; an Ended schedule keeps only Change. */
function ScheduleActions({
  ended,
  change,
  stop,
}: {
  ended: boolean
  change: string
  stop?: string
}) {
  return (
    <div className={cn('grid gap-2.5 *:px-3', !ended && 'grid-cols-2')}>
      <Link href={change} className={buttonVariants({ variant: 'outline', size: 'lg' })}>
        Change schedule
      </Link>
      {!ended && (
        // Stopping ends the schedule, so it never matches Change schedule's look.
        <Link
          href={stop ?? change}
          className={buttonVariants({ variant: 'destructive', size: 'lg' })}
        >
          Stop schedule
        </Link>
      )}
    </div>
  )
}

/** Medication detail with a running schedule's Last day, or an Ended schedule. */
export function LastDayDetail({
  schedule,
  endedOn,
  change,
  stop,
  alert,
  stopState,
  changed = false,
}: {
  schedule: LastDaySchedule
  /** Shows an Ended schedule dated this day. */
  endedOn?: string
  change: string
  stop?: string
  alert?: ReactNode
  /** Opens Stop schedule's confirm step in this state. */
  stopState?: StopState
  /** Restarted today through Change schedule. */
  changed?: boolean
}) {
  const version = labVersion(schedule, { endedOn, changed })
  const ended = endedDay(version, TODAY)
  return (
    <AppShell>
      <div className="flex flex-col gap-5 [overflow-wrap:anywhere]">
        <MedicationBackRow href={medicationsHref({ mode: 'list' })}>Medications</MedicationBackRow>
        <MedicationIdentity medicine={magnesium} />
        {alert}
        <section aria-labelledby="routine-heading" className="flex flex-col gap-3">
          <h2 id="routine-heading" className="sr-only">
            Schedule
          </h2>
          {version.intervalHours != null ? (
            <IntervalScheduleCard
              hours={version.intervalHours}
              anchor={intervalAnchor(version)}
              quantity={version.times[0].quantity}
              unit={magnesium.unit}
              now={NOW}
              lastDay={version.endDate}
              ended={ended}
            />
          ) : (
            <ClockScheduleCard schedule={version} unit={magnesium.unit} today={TODAY} />
          )}
          <ScheduleActions ended={Boolean(ended)} change={change} stop={stop} />
        </section>
        <p className="text-label text-muted-foreground">Details can&apos;t be changed here yet.</p>
      </div>
      {stopState && <StopScheduleDrawer state={stopState} />}
    </AppShell>
  )
}

/** The confirmation after Stop schedule saves: the card now reads Ended today. */
export function StoppedAlert() {
  return (
    <Alert variant="confirmation" role="status" aria-label="Stopped schedule">
      <AlertTitle>Schedule stopped for {magnesium.label}.</AlertTitle>
      <AlertDescription>No more doses after {formatTime(NOW)} today.</AlertDescription>
    </Alert>
  )
}

export function RestartedAlert() {
  return (
    <Alert variant="confirmation" role="status" aria-label="Saved schedule">
      <AlertTitle>Schedule saved for {magnesium.label}.</AlertTitle>
      <AlertDescription>Next dose: today at 20:00.</AlertDescription>
    </Alert>
  )
}

const iron: Medicine = { ...magnesium, id: '22222222-2222-4222-8222-222222222222', label: 'Iron' }
const zinc: Medicine = { ...magnesium, id: '33333333-3333-4333-8333-333333333333', label: 'Zinc' }
const vitaminD: Medicine = {
  ...magnesium,
  id: '44444444-4444-4444-8444-444444444444',
  label: 'Vitamin D',
  strength: null,
}
const omega: Medicine = {
  ...magnesium,
  id: '55555555-5555-4555-8555-555555555555',
  label: 'Omega 3',
  unit: 'capsule',
}

const running = (medicine: Medicine, extra: Partial<DailySchedule>): DailySchedule => ({
  ...labVersion({ kind: 'times', clock: { weekdays: EVERY_DAY, times: [] }, lastDay: null }, {}),
  id: medicine.id.replace(/.$/, 'a'),
  medicineId: medicine.id,
  times: [
    { time: '08:00', quantity: 1 },
    { time: '20:00', quantity: 1 },
  ],
  ...extra,
})

/**
 * Medications with an Ended group below the others. Magnesium runs to its Last day and its row
 * stays as it is; Vitamin D was stopped today.
 */
export function EndedListFrame() {
  return (
    <AppShell>
      <div className="flex flex-col gap-5">
        <AppHeader title="Medications" />
        <SchedulingClockProvider serverNow={NOW}>
          <MedicationRoutineGroups
            medicines={[magnesium, iron, omega, vitaminD, zinc]}
            schedules={[
              running(magnesium, { endDate: '2026-11-10' }),
              running(iron, {
                startDate: '2026-11-03',
                times: [{ time: '22:00', quantity: 1 }],
                intervalHours: 7,
              }),
              running(vitaminD, { stoppedAt: NOW }),
              running(zinc, { endDate: ENDED_ON }),
            ]}
            serverNow={NOW}
          />
        </SchedulingClockProvider>
      </div>
    </AppShell>
  )
}
