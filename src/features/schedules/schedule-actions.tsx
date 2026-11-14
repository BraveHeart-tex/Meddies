'use client'

import { useEffect, useRef, useState, type Ref } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { InfoIcon } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button, buttonVariants } from '@/components/ui/button'
import type { Medicine } from '@/features/medicines/contract'
import { MedicationsLink } from '@/features/medicines/medications-nav'
import { medicationResumeHref, medicationSetupHref } from '@/features/medicines/routes'
import { saveMessages } from '@/lib/save-messages'
import type { SaveProblem } from '@/lib/session-saves'
import { useKnownOffline } from '@/lib/use-known-offline'
import { cn } from '@/lib/utils'
import type { DailySchedule } from './contract'
import { scheduleKeys } from './queries'
import { ScheduleConfirmDrawer, type ScheduleConfirmKind } from './schedule-confirm-drawer'
import { useScheduleCommand, type ScheduleCommandKind } from './use-schedule-command'

/**
 * A paused card's actions (233·A4, A5): Resume (primary) beside a ghost Stop schedule. A Clock
 * schedule resumes in one tap; while it saves Resume reads "Resuming…" and Stop schedule holds, an
 * unknown result offers Retry of the same resume and a stale one the 215·S2 recovery (233·S3, S4).
 * An Interval schedule's Resume opens the Resume schedule screen. Known offline: Connect to save.
 */
export function PausedScheduleActions({
  interval,
  resumeHref,
  routerNavigation,
  pending,
  problem,
  offline,
  onResume,
  onStop,
  onReview,
  stopRef,
}: {
  interval: boolean
  resumeHref: string
  /** For the lab, whose frames are routes. */
  routerNavigation?: boolean
  pending: boolean
  problem?: SaveProblem
  offline: boolean
  onResume: () => void
  onStop: () => void
  onReview: () => void
  stopRef?: Ref<HTMLButtonElement>
}) {
  const stale = problem === 'conflict' || problem === 'rejected'
  const described = !pending && (offline || problem === 'unconfirmed')
  const label = pending
    ? 'Resuming…'
    : offline
      ? saveMessages.connectToSave
      : problem === 'unconfirmed'
        ? 'Retry'
        : 'Resume'
  return (
    <div className="flex flex-col gap-2.5">
      {stale ? (
        <>
          <Alert variant="destructive">
            <AlertTitle>This schedule changed while you were editing.</AlertTitle>
            <AlertDescription>
              Nothing here was saved. Review the current schedule, then make your change again.
            </AlertDescription>
          </Alert>
          <Button type="button" size="lg" className="w-full whitespace-normal" onClick={onReview}>
            Review current schedule
          </Button>
        </>
      ) : offline && !pending ? (
        <Alert id={RESUME_PROBLEM}>
          <InfoIcon aria-hidden="true" />
          <AlertTitle>{saveMessages.offline}</AlertTitle>
        </Alert>
      ) : (
        problem === 'unconfirmed' && (
          <Alert id={RESUME_PROBLEM} variant="destructive">
            <AlertDescription>
              That might not have saved. Check your connection and try again.
            </AlertDescription>
          </Alert>
        )
      )}
      <div className="grid grid-cols-2 gap-2.5 *:px-3">
        {!stale &&
          (interval && !pending && !offline ? (
            <MedicationsLink
              className={buttonVariants({ size: 'lg' })}
              href={resumeHref}
              routerNavigation={routerNavigation}
            >
              Resume
            </MedicationsLink>
          ) : (
            <Button
              type="button"
              size="lg"
              className="whitespace-normal"
              disabled={pending || offline}
              aria-describedby={described ? RESUME_PROBLEM : undefined}
              onClick={onResume}
            >
              {label}
            </Button>
          ))}
        <Button
          ref={stopRef}
          type="button"
          variant="ghost"
          size="lg"
          className={cn(stale && 'col-span-full')}
          disabled={pending}
          onClick={onStop}
        >
          Stop schedule
        </Button>
      </div>
    </div>
  )
}

const RESUME_PROBLEM = 'resume-schedule-problem'

/**
 * The actions under the schedule card. A running or not-yet-started schedule has an outline Change
 * schedule full width, then ghost Pause beside ghost Stop schedule (233·A1, A2); a paused one
 * Resume beside Stop schedule (233·A4, A5); an Ended one only Change schedule (227·A16, A17). Only
 * the Stop confirm is destructive (#286). Stays mounted when a save confirms, so the confirmation
 * reaches `onStopped`, `onPaused` or `onResumed`.
 */
export function ScheduleActions({
  medicine,
  schedule,
  ended,
  paused,
  onStopped,
  onPaused,
  onResumed,
}: {
  medicine: Medicine
  schedule: DailySchedule
  ended: boolean
  paused: boolean
  onStopped: (stopped: DailySchedule) => void
  onPaused: (paused: DailySchedule) => void
  onResumed: (resumed: DailySchedule) => void
}) {
  const client = useQueryClient()
  const [open, setOpen] = useState<ScheduleConfirmKind | null>(null)
  // The opening button goes once a save confirms: a stop leaves Change schedule, a pause Stop
  // schedule, a resume Change schedule. Either may mount only with the confirmed schedule,
  // after the drawer closes.
  const [confirmed, setConfirmed] = useState<ScheduleCommandKind | null>(null)
  const changeLink = useRef<HTMLAnchorElement>(null)
  const stopButton = useRef<HTMLButtonElement>(null)
  const focused = useRef<ScheduleCommandKind | null>(null)
  const offline = useKnownOffline()
  useEffect(() => {
    // Paused and running actions are separate trees, so wait for the confirmed one to mount.
    const ready = confirmed === 'pause' ? paused : !paused
    const target = confirmed === 'pause' ? stopButton.current : changeLink.current
    if (!confirmed || !ready || focused.current === confirmed || !target) return
    focused.current = confirmed
    target.focus()
  }, [confirmed, ended, paused])
  const confirm =
    (kind: ScheduleCommandKind, onSaved: (saved: DailySchedule) => void) =>
    (saved: DailySchedule) => {
      setConfirmed(kind)
      setOpen(null)
      onSaved(saved)
    }
  const saves = {
    stop: useScheduleCommand('stop', medicine, schedule, confirm('stop', onStopped)),
    pause: useScheduleCommand('pause', medicine, schedule, confirm('pause', onPaused)),
  }
  const resume = useScheduleCommand('resume', medicine, schedule, confirm('resume', onResumed))
  const begin = (kind: ScheduleConfirmKind) => {
    focused.current = null
    setConfirmed(null)
    setOpen(kind)
  }
  const review = (clear: () => void) => () => {
    clear()
    setOpen(null)
    void client.invalidateQueries({ queryKey: scheduleKeys.all })
  }
  const running = !ended && !paused
  const interval = schedule.intervalHours != null
  return (
    <>
      {paused ? (
        <PausedScheduleActions
          interval={interval}
          resumeHref={medicationResumeHref(medicine.id)}
          pending={resume.pending}
          // An Interval schedule's resume problems belong to its Resume schedule screen.
          problem={interval ? undefined : resume.problem}
          offline={offline}
          onResume={() => {
            focused.current = null
            setConfirmed(null)
            void resume.save()
          }}
          onStop={() => begin('stop')}
          onReview={review(resume.clear)}
          stopRef={stopButton}
        />
      ) : (
        <div className={cn('grid gap-2.5 *:px-3', running && 'grid-cols-2')}>
          <MedicationsLink
            ref={changeLink}
            className={cn(buttonVariants({ variant: 'outline', size: 'lg' }), 'col-span-full')}
            href={medicationSetupHref(medicine.id)}
          >
            Change schedule
          </MedicationsLink>
          {running && (
            <Button type="button" variant="ghost" size="lg" onClick={() => begin('pause')}>
              Pause
            </Button>
          )}
          {running && (
            <Button
              ref={stopButton}
              type="button"
              variant="ghost"
              size="lg"
              onClick={() => begin('stop')}
            >
              Stop schedule
            </Button>
          )}
        </div>
      )}
      {(['stop', 'pause'] as const).map((kind) => (
        <ScheduleConfirmDrawer
          key={kind}
          command={kind}
          open={open === kind}
          label={medicine.label}
          pending={saves[kind].pending}
          problem={saves[kind].problem}
          offline={offline}
          finalFocus={!confirmed}
          onConfirm={() => void saves[kind].save()}
          onKeep={() => setOpen(null)}
          onReview={review(saves[kind].clear)}
        />
      ))}
    </>
  )
}
