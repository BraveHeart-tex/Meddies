'use client'

import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Button, buttonVariants } from '@/components/ui/button'
import type { Medicine } from '@/features/medicines/contract'
import { MedicationsLink } from '@/features/medicines/medications-nav'
import { medicationSetupHref } from '@/features/medicines/routes'
import { useKnownOffline } from '@/lib/use-known-offline'
import { cn } from '@/lib/utils'
import type { DailySchedule } from './contract'
import { scheduleKeys } from './queries'
import { ScheduleConfirmDrawer, type ScheduleConfirmKind } from './schedule-confirm-drawer'
import { useScheduleCommand } from './use-schedule-command'

/**
 * The actions under the schedule card. A running or not-yet-started schedule has Change schedule
 * full width, then Pause beside Stop schedule (233·A1, A2); a paused one keeps only Stop schedule
 * (233·A4); an Ended one only Change schedule (227·A16, A17). Stays mounted when a save
 * confirms, so the confirmation reaches `onStopped` or `onPaused`.
 */
export function ScheduleActions({
  medicine,
  schedule,
  ended,
  paused,
  onStopped,
  onPaused,
}: {
  medicine: Medicine
  schedule: DailySchedule
  ended: boolean
  paused: boolean
  onStopped: (stopped: DailySchedule) => void
  onPaused: (paused: DailySchedule) => void
}) {
  const client = useQueryClient()
  const [open, setOpen] = useState<ScheduleConfirmKind | null>(null)
  // The opening button goes once a save confirms: a stop leaves Change schedule, a pause Stop
  // schedule. Either may mount only with the confirmed schedule, after the drawer closes.
  const [confirmed, setConfirmed] = useState<ScheduleConfirmKind | null>(null)
  const changeLink = useRef<HTMLAnchorElement>(null)
  const stopButton = useRef<HTMLButtonElement>(null)
  const focused = useRef<ScheduleConfirmKind | null>(null)
  const offline = useKnownOffline()
  useEffect(() => {
    const target = confirmed === 'stop' ? changeLink.current : stopButton.current
    if (!confirmed || focused.current === confirmed || !target) return
    focused.current = confirmed
    target.focus()
  }, [confirmed, ended, paused])
  const confirm =
    (kind: ScheduleConfirmKind, onSaved: (saved: DailySchedule) => void) =>
    (saved: DailySchedule) => {
      setConfirmed(kind)
      setOpen(null)
      onSaved(saved)
    }
  const saves = {
    stop: useScheduleCommand('stop', medicine, schedule, confirm('stop', onStopped)),
    pause: useScheduleCommand('pause', medicine, schedule, confirm('pause', onPaused)),
  }
  const begin = (kind: ScheduleConfirmKind) => {
    focused.current = null
    setConfirmed(null)
    setOpen(kind)
  }
  const running = !ended && !paused
  return (
    <>
      {/* Children keep their positions, so Stop schedule survives a pause with its focus. */}
      <div className={cn('grid gap-2.5 *:px-3', running && 'grid-cols-2')}>
        {!paused && (
          <MedicationsLink
            ref={changeLink}
            className={cn(buttonVariants({ variant: 'outline', size: 'lg' }), 'col-span-full')}
            href={medicationSetupHref(medicine.id)}
          >
            Change schedule
          </MedicationsLink>
        )}
        {running && (
          <Button type="button" variant="outline" size="lg" onClick={() => begin('pause')}>
            Pause
          </Button>
        )}
        {!ended && (
          // Stopping ends the schedule, so it never matches Change schedule's look.
          <Button
            ref={stopButton}
            type="button"
            variant="destructive"
            size="lg"
            onClick={() => begin('stop')}
          >
            Stop schedule
          </Button>
        )}
      </div>
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
