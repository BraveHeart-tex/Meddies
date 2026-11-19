'use client'

import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { CalendarCog, CircleStop, InfoIcon, Pause } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button, buttonVariants } from '@/components/ui/button'
import type { Medicine } from '@/features/medicines/contract'
import { MedicationInsetRow } from '@/features/medicines/medication-inset-list'
import { MedicationsLink } from '@/features/medicines/medications-nav'
import { medicationResumeHref, medicationSetupHref } from '@/features/medicines/routes'
import { saveMessages } from '@/lib/save-messages'
import { useKnownOffline } from '@/lib/use-known-offline'
import type { DailySchedule } from './contract'
import { confirmPaused, confirmResumed, confirmStopped } from './medication-confirmations'
import { scheduleKeys } from './queries'
import { ScheduleConfirmDrawer, type ScheduleConfirmKind } from './schedule-confirm-drawer'
import { useScheduleCommand } from './use-schedule-command'

/**
 * A paused schedule's Resume on the summary (238·A3): berry, full width under the card. A Clock
 * schedule resumes in one tap; while it saves Resume reads "Resuming…", an unknown result offers
 * Retry of the same resume and a stale one the 215·S2 recovery (233·S3, S4). An Interval
 * schedule's Resume opens the Resume schedule screen. Known offline: Connect to save. A confirmed
 * resume shows its Toast (#377) and hands focus to Log a dose, which takes Resume's place. Stays
 * mounted once resumed so that focus can follow.
 */
export function ResumeScheduleAction({
  medicine,
  schedule,
  paused,
}: {
  medicine: Medicine
  schedule: DailySchedule
  paused: boolean
}) {
  const client = useQueryClient()
  const offline = useKnownOffline()
  const [confirmed, setConfirmed] = useState(false)
  const focused = useRef(false)
  const resume = useScheduleCommand('resume', medicine, schedule, (saved) => {
    setConfirmed(true)
    confirmResumed(medicine.label, saved)
  })
  useEffect(() => {
    if (!confirmed || paused || focused.current) return
    focused.current = true
    document.getElementById(`log-dose-${medicine.id}`)?.focus()
  }, [confirmed, paused, medicine.id])
  if (!paused) return null
  const interval = schedule.intervalHours != null
  // An Interval schedule's resume problems belong to its Resume schedule screen.
  const problem = interval ? undefined : resume.problem
  const pending = resume.pending
  // The command reports a rejection as a conflict.
  const stale = problem === 'conflict'
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
            <AlertTitle>This schedule changed elsewhere.</AlertTitle>
            <AlertDescription>Your changes weren&apos;t saved.</AlertDescription>
          </Alert>
          <Button
            type="button"
            size="lg"
            className="w-full whitespace-normal"
            onClick={() => {
              resume.clear()
              void client.invalidateQueries({ queryKey: scheduleKeys.all })
            }}
          >
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
              That might not have saved. Check your connection, then retry.
            </AlertDescription>
          </Alert>
        )
      )}
      {!stale &&
        (interval && !pending && !offline ? (
          <MedicationsLink
            className={buttonVariants({ size: 'lg', className: 'w-full' })}
            href={medicationResumeHref(medicine.id)}
          >
            Resume
          </MedicationsLink>
        ) : (
          <Button
            type="button"
            size="lg"
            className="w-full whitespace-normal"
            disabled={pending || offline}
            aria-describedby={described ? RESUME_PROBLEM : undefined}
            onClick={() => {
              focused.current = false
              setConfirmed(false)
              void resume.save()
            }}
          >
            {label}
          </Button>
        ))}
    </div>
  )
}

const RESUME_PROBLEM = 'resume-schedule-problem'

/**
 * Manage's Schedule rows (403·B14): Change schedule, then Pause while running or starting later,
 * then Stop schedule in destructive text until it ends; paused leaves Stop schedule alone, Ended
 * Change schedule alone. Pause and Stop open their confirms, and only Stop's is destructive
 * (#286). A confirmed save shows its Toast (#377); a pause then focuses Stop schedule, a stop
 * Change schedule.
 */
export function ManageScheduleRows({
  medicine,
  schedule,
  ended,
  paused,
}: {
  medicine: Medicine
  schedule: DailySchedule
  ended: boolean
  paused: boolean
}) {
  const client = useQueryClient()
  const [open, setOpen] = useState<ScheduleConfirmKind | null>(null)
  // The opening row goes once a save confirms; its target mounts only with the confirmed
  // schedule, after the drawer closes.
  const [confirmed, setConfirmed] = useState<ScheduleConfirmKind | null>(null)
  const changeLink = useRef<HTMLAnchorElement & HTMLButtonElement>(null)
  const stopButton = useRef<HTMLAnchorElement & HTMLButtonElement>(null)
  const focused = useRef<ScheduleConfirmKind | null>(null)
  const offline = useKnownOffline()
  useEffect(() => {
    const ready = confirmed === 'pause' ? paused : !paused
    const target = confirmed === 'pause' ? stopButton.current : changeLink.current
    if (!confirmed || !ready || focused.current === confirmed || !target) return
    focused.current = confirmed
    target.focus()
  }, [confirmed, ended, paused])
  const confirm =
    (kind: ScheduleConfirmKind, onSaved: (label: string, saved: DailySchedule) => void) =>
    (saved: DailySchedule) => {
      setConfirmed(kind)
      setOpen(null)
      onSaved(medicine.label, saved)
    }
  const saves = {
    stop: useScheduleCommand('stop', medicine, schedule, confirm('stop', confirmStopped)),
    pause: useScheduleCommand('pause', medicine, schedule, confirm('pause', confirmPaused)),
  }
  const begin = (kind: ScheduleConfirmKind) => {
    focused.current = null
    setConfirmed(null)
    setOpen(kind)
  }
  const running = !ended && !paused
  return (
    <>
      {!paused && (
        <MedicationInsetRow
          ref={changeLink}
          icon={CalendarCog}
          label="Change schedule"
          href={medicationSetupHref(medicine.id)}
        />
      )}
      {running && <MedicationInsetRow icon={Pause} label="Pause" onClick={() => begin('pause')} />}
      {!ended && (
        <MedicationInsetRow
          ref={stopButton}
          icon={CircleStop}
          label="Stop schedule"
          tone="destructive"
          onClick={() => begin('stop')}
        />
      )}
      {(['stop', 'pause'] as const).map((kind) => (
        <ScheduleConfirmDrawer
          key={kind}
          command={kind}
          open={open === kind}
          pending={saves[kind].pending}
          problem={saves[kind].problem}
          offline={offline}
          finalFocus={!confirmed}
          onConfirm={() => void saves[kind].save()}
          onKeep={() => setOpen(null)}
          onReview={() => {
            saves[kind].clear()
            setOpen(null)
            void client.invalidateQueries({ queryKey: scheduleKeys.all })
          }}
        />
      ))}
    </>
  )
}
