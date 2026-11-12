'use client'

import { useState } from 'react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer'
import { ScheduleDateLines } from '@/features/schedules/clock-schedule-card'
import { intervalLabel } from '@/features/schedules/interval-preview'
import { weekdaySummary } from '@/features/schedules/weekdays'
import { quantityLabel } from '@/lib/dose-quantity'
import { magnesium, TODAY } from './lab-fixtures'
import { doseWhen, firstDoseAfterResume, pausedSince, type PausableSchedule } from './pause-model'

export type SaveStep = 'idle' | 'saving' | 'unknown'

/**
 * Pause's confirm step, shaped like Stop schedule's (227·A15): nothing saves until Pause schedule.
 * While pausing it holds open with both buttons disabled; an unknown result offers Retry.
 */
export function PauseScheduleDrawer({ state = 'idle' }: { state?: SaveStep }) {
  const [open, setOpen] = useState(true)
  const pending = state === 'saving'
  return (
    <Drawer
      open={open}
      disablePointerDismissal={pending}
      onOpenChange={(next, eventDetails) => {
        if (next) return
        if (pending) eventDetails.cancel()
        else setOpen(false)
      }}
    >
      <DrawerContent>
        <div className="-mt-2 flex flex-col gap-3" aria-busy={pending}>
          <DrawerHeader className="text-center">
            <DrawerTitle className="text-heading">Pause this schedule?</DrawerTitle>
          </DrawerHeader>
          <ul className="flex flex-col gap-2 text-body-sm text-muted-foreground">
            <li>Doses due so far, and any you&apos;ve logged, stay as they are.</li>
            <li>Meddies won&apos;t expect any doses of {magnesium.label} until you resume.</li>
            <li>Nothing is added later for the paused days.</li>
            <li>Refill alerts keep going.</li>
          </ul>
          {state === 'unknown' && (
            <Alert id="pause-schedule-problem" variant="destructive">
              <AlertDescription>
                That might not have saved. Check your connection and try again.
              </AlertDescription>
            </Alert>
          )}
          <Button
            type="button"
            size="lg"
            className="w-full"
            disabled={pending}
            aria-describedby={state === 'unknown' ? 'pause-schedule-problem' : undefined}
          >
            {pending ? 'Pausing…' : state === 'unknown' ? 'Retry' : 'Pause schedule'}
          </Button>
          <Button
            type="button"
            size="lg"
            variant="outline"
            className="w-full"
            disabled={pending}
            onClick={() => setOpen(false)}
          >
            Keep schedule
          </Button>
        </div>
      </DrawerContent>
    </Drawer>
  )
}

/**
 * A paused schedule's card: its times or interval and quantity, "Paused since", then its Last
 * day. No next doses while paused.
 */
export function PausedScheduleCard({ schedule }: { schedule: PausableSchedule }) {
  const since = pausedSince(schedule) ?? ''
  const interval = schedule.intervalHours
  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-baseline justify-between gap-2">
        <CardTitle>Schedule</CardTitle>
        <CardDescription>
          {interval != null ? intervalLabel(interval) : weekdaySummary(schedule.weekdays, 'long')}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {interval != null ? (
          <p className="text-body-sm">
            {quantityLabel(schedule.times[0].quantity, magnesium.unit)} each time
          </p>
        ) : (
          <ul className="divide-y">
            {schedule.times.map((slot) => (
              <li key={slot.time} className="flex flex-wrap justify-between gap-2 py-3">
                <span className="text-heading font-extrabold">{slot.time}</span>
                <span className="text-body-sm">{quantityLabel(slot.quantity, magnesium.unit)}</span>
              </li>
            ))}
          </ul>
        )}
        <ScheduleDateLines started={since} lastDay={schedule.endDate} ended={null} today={TODAY} />
      </CardContent>
    </Card>
  )
}

export function PausedAlert() {
  return (
    <Alert variant="confirmation" role="status" aria-label="Paused schedule">
      <AlertTitle>Schedule paused for {magnesium.label}.</AlertTitle>
      <AlertDescription>No doses expected until you resume.</AlertDescription>
    </Alert>
  )
}

/** After the server saves Resume: the next dose, or none left before the Last day. */
export function ResumedAlert({ schedule }: { schedule: PausableSchedule }) {
  const next = firstDoseAfterResume(schedule)
  return (
    <Alert variant="confirmation" role="status" aria-label="Resumed schedule">
      <AlertTitle>Schedule resumed for {magnesium.label}.</AlertTitle>
      <AlertDescription>
        {next ? `Next dose: ${doseWhen(next)}.` : 'No more doses are due. Today is its Last day.'}
      </AlertDescription>
    </Alert>
  )
}
