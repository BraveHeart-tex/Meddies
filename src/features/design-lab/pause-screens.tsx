'use client'

import { useState, type ReactNode } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { AppShell } from '@/components/layout/app-shell'
import { StickyActions } from '@/components/layout/sticky-actions'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button, buttonVariants } from '@/components/ui/button'
import { MedicationBackRow, MedicationIdentity } from '@/features/medicines/medication-sub-screen'
import { medicationsHref } from '@/features/medicines/routes'
import {
  IntervalFirstDateField,
  IntervalFirstTimeField,
} from '@/features/schedules/interval-fields'
import {
  IntervalRow,
  IntervalSheet,
  intervalStartsAnswer,
  NextDoses,
  ScheduleSetupHeader,
} from '@/features/schedules/interval-setup-parts'
import { formatShortDay } from '@/lib/calendar-date'
import { quantityLabel } from '@/lib/dose-quantity'
import { cn } from '@/lib/utils'
import { magnesium, TODAY } from './lab-fixtures'
import { resumeDoses, type PausableSchedule, type ResumeValues } from './pause-model'
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

/**
 * Resume beside Stop schedule on a paused card (233·A4, A5). A Clock schedule resumes in one tap
 * with no form; an Interval schedule opens the resume screen.
 */
function PausedActions({
  links,
  interval,
  resume = 'idle',
}: {
  links: Links
  interval: boolean
  resume?: SaveStep
}) {
  const pending = resume === 'saving'
  return (
    <div className="flex flex-col gap-2.5">
      {resume === 'unknown' && (
        <Alert id="resume-problem" variant="destructive">
          <AlertDescription>
            That might not have saved. Check your connection and try again.
          </AlertDescription>
        </Alert>
      )}
      <div className="grid grid-cols-2 gap-2.5 *:px-3">
        {interval ? (
          <Link href={links.resume} className={buttonVariants({ size: 'lg' })}>
            Resume
          </Link>
        ) : (
          <Button
            type="button"
            size="lg"
            disabled={pending}
            aria-describedby={resume === 'unknown' ? 'resume-problem' : undefined}
          >
            {pending ? 'Resuming…' : resume === 'unknown' ? 'Retry' : 'Resume'}
          </Button>
        )}
        {pending ? (
          <Button type="button" size="lg" variant="destructive" disabled>
            Stop schedule
          </Button>
        ) : (
          <Link href={links.stop} className={destructive}>
            Stop schedule
          </Link>
        )}
      </div>
    </div>
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

/** What resuming keeps: the interval, the quantity and the Last day. */
function ResumeSummary({ schedule }: { schedule: PausableSchedule }) {
  const quantity = quantityLabel(schedule.times[0].quantity, magnesium.unit)
  return (
    <p className="text-body-sm text-muted-foreground">
      Every {schedule.intervalHours} hours, {quantity} each time.
      {schedule.endDate && ` Last day ${formatShortDay(schedule.endDate, TODAY)}.`} Choose when
      doses start again.
    </p>
  )
}

/**
 * Interval resume (233·A9 to A12, S5): a full screen like Change schedule with the Starts row and
 * sheet (215·A4), the next 3 doses up to the Last day, and Resume schedule pinned to the bottom.
 */
export function ResumeScreen({
  initial,
  schedule,
  error,
  saving,
  back,
}: {
  initial: ResumeValues
  schedule: PausableSchedule
  error?: string
  saving?: boolean
  back: string
}) {
  const router = useRouter()
  const [values, setValues] = useState(initial)
  const update = (next: Partial<ResumeValues>) => setValues((v) => ({ ...v, ...next }))
  const [sheet, setSheet] = useState(false)
  const [snapshot, setSnapshot] = useState(values)
  const hours = schedule.intervalHours ?? 8
  return (
    <main className="mx-auto flex min-h-svh max-w-2xl flex-col px-5 pt-[calc(0.875rem+env(safe-area-inset-top,0px))]">
      <section
        aria-labelledby="schedule-heading"
        aria-busy={saving}
        className="flex flex-1 flex-col gap-5 [overflow-wrap:anywhere]"
      >
        <ScheduleSetupHeader
          label={magnesium.label}
          subtitle="Resume schedule"
          onCancel={() => router.push(back)}
        />
        <ResumeSummary schedule={schedule} />
        <ul className="divide-y rounded-xl border bg-card">
          <IntervalRow
            id="resume-starts"
            label="Starts"
            value={values.time ? intervalStartsAnswer(values.date, values.time, TODAY) : null}
            error={error}
            disabled={saving}
            onClick={() => {
              setSnapshot(values)
              setSheet(true)
            }}
          />
        </ul>
        <IntervalSheet
          open={sheet}
          title="Starts"
          onCancel={() => {
            update(snapshot)
            setSheet(false)
          }}
          onDone={() => setSheet(false)}
        >
          <IntervalFirstDateField
            today={TODAY}
            value={values.date}
            onChange={(date) => update({ date })}
          />
          <IntervalFirstTimeField value={values.time} onChange={(time) => update({ time })} />
        </IntervalSheet>
        <NextDoses
          doses={resumeDoses(values, hours)}
          hours={hours}
          lastDay={schedule.endDate}
          today={TODAY}
        />
        <StickyActions>
          <Button type="button" size="lg" disabled={saving} className="w-full whitespace-normal">
            {saving ? 'Resuming…' : 'Resume schedule'}
          </Button>
        </StickyActions>
      </section>
    </main>
  )
}
