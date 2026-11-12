'use client'

import type { ReactNode } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { AppShell } from '@/components/layout/app-shell'
import { StickyActions } from '@/components/layout/sticky-actions'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { buttonVariants } from '@/components/ui/button'
import { MedicationBackRow, MedicationIdentity } from '@/features/medicines/medication-sub-screen'
import { medicationsHref } from '@/features/medicines/routes'
import { ClockScheduleCard } from '@/features/schedules/clock-schedule-card'
import { IntervalScheduleCard } from '@/features/schedules/interval-schedule-card'
import { NextDoses, ScheduleSetupHeader } from '@/features/schedules/interval-setup-parts'
import {
  CLOCK_STARTED,
  intervalAnchor,
  type ClockValues,
  type CurrentSchedule,
  type IntervalValues,
  type ScheduleKind,
} from './edit-lab-model'
import { useScheduleEdit } from './use-schedule-edit'
import {
  ClockEditFields,
  EditFooter,
  IntervalEditRows,
  KindToggle,
  LabData,
  type SaveState,
} from './edit-lab-parts'
import { magnesium, NOW, TODAY } from './interval-lab-model'

type Initial = { kind?: ScheduleKind; clock?: ClockValues; interval?: IntervalValues }

const asSchedule = (clock: ClockValues) => ({
  weekdays: clock.weekdays,
  startDate: CLOCK_STARTED,
  times: [...clock.times]
    .sort((a, b) => a.time.localeCompare(b.time))
    .map((slot) => ({ time: slot.time, quantity: Number(slot.quantity) })),
})

function ScheduleCard({ schedule }: { schedule: CurrentSchedule }) {
  return schedule.kind === 'times' ? (
    <ClockScheduleCard schedule={asSchedule(schedule.clock)} unit={magnesium.unit} today={TODAY} />
  ) : (
    <IntervalScheduleCard
      hours={Number(schedule.interval.hours)}
      anchor={intervalAnchor(schedule.interval)}
      quantity={Number(schedule.interval.quantity)}
      unit={magnesium.unit}
      now={NOW}
    />
  )
}

/** Medication detail: Change schedule sits under the card, replacing the old footnote (215·A1). */
export function ChangeEntryFrame({
  schedule,
  next,
  alert,
}: {
  schedule: CurrentSchedule
  next: string
  alert?: ReactNode
}) {
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
          <ScheduleCard schedule={schedule} />
          <Link href={next} className={buttonVariants({ variant: 'outline', size: 'lg' })}>
            Change schedule
          </Link>
        </section>
        <p className="text-label text-muted-foreground">Details can&apos;t be changed here yet.</p>
      </div>
    </AppShell>
  )
}

/** Back on Medication detail once the server saves, with the new version shown (215·S3, S4). */
export function SavedFrame({
  schedule,
  first,
  next,
}: {
  schedule: CurrentSchedule
  first: string
  next: string
}) {
  return (
    <ChangeEntryFrame
      schedule={schedule}
      next={next}
      alert={
        <Alert variant="confirmation" role="status" aria-label="Saved schedule">
          <AlertTitle>Schedule saved for {magnesium.label}.</AlertTitle>
          <AlertDescription>Next dose: {first}.</AlertDescription>
        </Alert>
      }
    />
  )
}

/**
 * The approved setup screen (212·C0) reopened on the current Schedule version, with the next 3
 * doses after now under the form and Save changes pinned to the bottom (215·A2 to A9).
 */
export function FullScreenEdit({
  current,
  initial,
  state = 'idle',
  back,
  startsError,
}: {
  current: CurrentSchedule
  initial?: Initial
  state?: SaveState
  back: string
  startsError?: string
}) {
  const router = useRouter()
  const edit = useScheduleEdit(current, initial)
  const disabled = state !== 'idle'
  return (
    <LabData>
      <main className="mx-auto flex min-h-svh max-w-2xl flex-col px-5 pt-[calc(0.875rem+env(safe-area-inset-top,0px))]">
        <section
          aria-labelledby="schedule-heading"
          aria-busy={state === 'saving'}
          className="flex flex-1 flex-col gap-5 [overflow-wrap:anywhere]"
        >
          <ScheduleSetupHeader
            label={magnesium.label}
            subtitle="Change schedule"
            onCancel={() => router.push(back)}
          />
          <KindToggle value={edit.kind} onChange={edit.setKind} disabled={disabled} />
          {edit.kind === 'times' ? (
            <ClockEditFields value={edit.clock} onChange={edit.setClock} disabled={disabled} />
          ) : (
            <IntervalEditRows edit={edit} disabled={disabled} error={startsError} />
          )}
          <NextDoses doses={edit.doses} today={TODAY} after={NOW} />
          <StickyActions>
            <EditFooter changed={edit.changed} state={state} onReview={() => router.push(back)} />
          </StickyActions>
        </section>
      </main>
    </LabData>
  )
}
