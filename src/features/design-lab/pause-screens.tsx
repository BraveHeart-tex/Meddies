'use client'

import { useState, type ReactNode } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AppShell } from '@/components/layout/app-shell'
import { buttonVariants } from '@/components/ui/button'
import { MedicationBackRow, MedicationIdentity } from '@/features/medicines/medication-sub-screen'
import { medicationsHref } from '@/features/medicines/routes'
import type { ResumeValues } from '@/features/schedules/resume'
import { ResumeScheduleForm } from '@/features/schedules/resume-schedule-form'
import { PausedScheduleActions } from '@/features/schedules/schedule-actions'
import { cn } from '@/lib/utils'
import { magnesium, NOW, TODAY } from './lab-fixtures'
import type { PausableSchedule } from './pause-model'
import { LabScheduleCard, PauseScheduleDrawer, type SaveStep } from './pause-parts'

export type Links = { change: string; pause: string; stop: string; resume: string }

const outline = buttonVariants({ variant: 'outline', size: 'lg' })
const destructive = buttonVariants({ variant: 'destructive', size: 'lg' })

/** A running schedule's actions (233·A1): Change schedule full width, Pause beside Stop schedule. */
function RunningActions({ links }: { links: Links }) {
  return (
    <div className="grid grid-cols-2 gap-2.5 *:px-3">
      <Link href={links.change} className={cn(outline, 'col-span-2')}>
        Change schedule
      </Link>
      <Link href={links.pause} className={outline}>
        Pause
      </Link>
      <Link href={links.stop} className={destructive}>
        Stop schedule
      </Link>
    </div>
  )
}

/** The production paused actions in a fixed save state (233·A4, A5, S3, S4). */
function PausedActions({
  links,
  interval,
  resume = 'idle',
}: {
  links: Links
  interval: boolean
  resume?: SaveStep
}) {
  const router = useRouter()
  return (
    <PausedScheduleActions
      interval={interval}
      resumeHref={links.resume}
      routerNavigation
      pending={resume === 'saving'}
      problem={resume === 'unknown' ? 'unconfirmed' : undefined}
      offline={false}
      onResume={() => {}}
      onStop={() => router.push(links.stop)}
      onReview={() => {}}
    />
  )
}

/** Medication detail: a running or paused schedule with its actions. */
export function PauseDetail({
  schedule,
  links,
  alert,
  pause,
  resume,
}: {
  schedule: PausableSchedule
  links: Links
  alert?: ReactNode
  /** Opens Pause's confirm step in this state. */
  pause?: SaveStep
  /** A Clock schedule's one-tap Resume in this state. */
  resume?: SaveStep
}) {
  const paused = Boolean(schedule.pausedAt)
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
          {paused ? (
            <>
              <LabScheduleCard schedule={schedule} />
              <PausedActions
                links={links}
                interval={schedule.intervalHours != null}
                resume={resume}
              />
            </>
          ) : (
            <>
              <LabScheduleCard schedule={schedule} />
              <RunningActions links={links} />
            </>
          )}
        </section>
        <p className="text-label text-muted-foreground">Details can&apos;t be changed here yet.</p>
      </div>
      {pause && <PauseScheduleDrawer state={pause} />}
    </AppShell>
  )
}

/**
 * The production Resume schedule screen (233·A9 to A12, S5) at the lab's fixed clock. Nothing
 * saves in the lab.
 */
export function ResumeScreen({
  initial,
  schedule,
  validated,
  saving = false,
  back,
}: {
  initial: ResumeValues
  schedule: PausableSchedule
  /** Shows the state after a Save. */
  validated?: boolean
  saving?: boolean
  back: string
}) {
  const router = useRouter()
  const [client] = useState(() => new QueryClient())
  return (
    <QueryClientProvider client={client}>
      <main className="mx-auto flex min-h-svh max-w-2xl flex-col gap-5 px-5 pt-[calc(0.875rem+env(safe-area-inset-top,0px))]">
        <ResumeScheduleForm
          label={magnesium.label}
          unit={magnesium.unit}
          schedule={schedule}
          today={TODAY}
          now={NOW}
          draftKey={null}
          pending={saving}
          offline={false}
          initialValues={initial}
          validateOnOpen={validated}
          onSubmit={() => {}}
          onCancel={() => router.push(back)}
          onReview={() => router.push(back)}
        />
      </main>
    </QueryClientProvider>
  )
}
