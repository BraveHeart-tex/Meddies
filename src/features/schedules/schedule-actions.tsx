'use client'

import { useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Button, buttonVariants } from '@/components/ui/button'
import type { Medicine } from '@/features/medicines/contract'
import { MedicationsLink } from '@/features/medicines/medications-nav'
import { medicationSetupHref } from '@/features/medicines/routes'
import { useKnownOffline } from '@/lib/use-known-offline'
import { cn } from '@/lib/utils'
import type { DailySchedule } from './contract'
import { scheduleKeys } from './queries'
import { StopScheduleDrawer } from './stop-schedule-drawer'
import { useScheduleStop } from './use-schedule-stop'

/**
 * Change schedule and Stop schedule side by side under the schedule card (779·A13, A14, A19). An
 * Ended schedule keeps only Change schedule, filling the row (779·A16, A17). Stays mounted when
 * the stop confirms, so the confirmation reaches `onStopped`.
 */
export function ScheduleActions({
  medicine,
  schedule,
  ended,
  onStopped,
}: {
  medicine: Medicine
  schedule: DailySchedule
  ended: boolean
  onStopped: (stopped: DailySchedule) => void
}) {
  const client = useQueryClient()
  const [open, setOpen] = useState(false)
  const [confirmed, setConfirmed] = useState(false)
  const changeLink = useRef<HTMLAnchorElement>(null)
  const offline = useKnownOffline()
  const stop = useScheduleStop(medicine, schedule, (stopped) => {
    setConfirmed(true)
    setOpen(false)
    onStopped(stopped)
  })
  return (
    <>
      <div className={cn('grid gap-2.5 *:px-3', !ended && 'grid-cols-2')}>
        <MedicationsLink
          ref={changeLink}
          className={buttonVariants({ variant: 'outline', size: 'lg' })}
          href={medicationSetupHref(medicine.id)}
        >
          Change schedule
        </MedicationsLink>
        {!ended && (
          // Stopping ends the schedule, so it never matches Change schedule's look.
          <Button
            type="button"
            variant="destructive"
            size="lg"
            onClick={() => {
              setConfirmed(false)
              setOpen(true)
            }}
          >
            Stop schedule
          </Button>
        )}
      </div>
      <StopScheduleDrawer
        open={open}
        label={medicine.label}
        pending={stop.pending}
        problem={stop.problem}
        offline={offline}
        // Stop schedule goes once the stop confirms.
        finalFocus={confirmed ? changeLink : true}
        onStop={() => void stop.stop()}
        onKeep={() => setOpen(false)}
        onReview={() => {
          stop.clear()
          setOpen(false)
          void client.invalidateQueries({ queryKey: scheduleKeys.all })
        }}
      />
    </>
  )
}
