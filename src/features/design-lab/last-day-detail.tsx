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
import { intervalRowSummary } from '@/features/schedules/interval-dose-list'
import { nextIntervalDoses } from '@/features/schedules/interval-preview'
import { MedicationRow } from '@/features/schedules/medication-row'
import { formatTime } from '@/lib/calendar-date'
import { cn } from '@/lib/utils'
import { CLOCK_STARTED, intervalAnchor } from './edit-lab-model'
import { magnesium, NOW, TODAY } from './lab-fixtures'
import { LastDayClockCard, LastDayIntervalCard } from './last-day-cards'
import { ENDED_ON, shortDay, untilLastDay, type LastDaySchedule } from './last-day-model'
import { StopScheduleDrawer, type StopState } from './last-day-parts'

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

const clockStarted = `Started ${shortDay(CLOCK_STARTED)}`

/** Medication detail with a running schedule's Last day, or an Ended schedule. */
export function LastDayDetail({
  schedule,
  endedOn,
  change,
  stop,
  alert,
  stopState,
  started = clockStarted,
}: {
  schedule: LastDaySchedule
  /** Shows an Ended schedule dated this day. */
  endedOn?: string
  change: string
  stop?: string
  alert?: ReactNode
  /** Opens Stop schedule's confirm step in this state. */
  stopState?: StopState
  /** The Clock card's first date line. */
  started?: string
}) {
  const ended = Boolean(endedOn)
  const state = endedOn
    ? ({ status: 'ended', endedOn } as const)
    : ({ status: 'running', lastDay: schedule.lastDay } as const)
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
          {schedule.kind === 'times' ? (
            <LastDayClockCard clock={schedule.clock} started={started} state={state} />
          ) : (
            <LastDayIntervalCard
              interval={schedule.interval}
              doses={
                untilLastDay(
                  nextIntervalDoses({
                    anchor: intervalAnchor(schedule.interval),
                    hours: Number(schedule.interval.hours),
                    now: NOW,
                  }),
                  schedule.lastDay,
                ) ?? []
              }
              started={`Started ${shortDay(schedule.interval.date)} at ${schedule.interval.time}`}
              state={state}
            />
          )}
          <ScheduleActions ended={ended} change={change} stop={stop} />
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

function Group({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section aria-label={label} className="flex flex-col gap-2.5">
      <h3 className="px-1 pt-1 text-label leading-none font-extrabold tracking-eyebrow text-muted-foreground uppercase">
        {label}
      </h3>
      <ul className="flex flex-col gap-2.5">{children}</ul>
    </section>
  )
}

/**
 * Medications with an Ended group below the others. Magnesium runs to its Last day and its row
 * stays as it is.
 */
export function EndedListFrame() {
  const ironNext = nextIntervalDoses({
    anchor: '2026-11-03T19:00:00.000Z',
    hours: 7,
    now: NOW,
    count: 1,
  })[0]
  return (
    <AppShell>
      <div className="flex flex-col gap-5">
        <AppHeader title="Medications" />
        <Group label="On a schedule">
          <MedicationRow medicine={magnesium} scheduleSummary="Every day · 08:00, 20:00" />
          <MedicationRow medicine={iron} scheduleSummary={intervalRowSummary(7, ironNext, TODAY)} />
        </Group>
        <Group label="No schedule">
          <MedicationRow medicine={omega} scheduleSummary={null} />
        </Group>
        <section aria-label="Ended" className="flex flex-col gap-2.5">
          <h3 className="px-1 pt-1 text-label leading-none font-extrabold tracking-eyebrow text-muted-foreground uppercase">
            Ended
          </h3>
          <ul className="flex flex-col gap-2.5">
            <MedicationRow medicine={vitaminD} scheduleSummary={`Ended ${shortDay(TODAY)}`} />
            <MedicationRow medicine={zinc} scheduleSummary={`Ended ${shortDay(ENDED_ON)}`} />
          </ul>
        </section>
      </div>
    </AppShell>
  )
}
