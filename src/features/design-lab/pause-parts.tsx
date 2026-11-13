'use client'

import { useState } from 'react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { ClockScheduleCard } from '@/features/schedules/clock-schedule-card'
import { intervalAnchor } from '@/features/schedules/interval-preview'
import { IntervalScheduleCard } from '@/features/schedules/interval-schedule-card'
import { pausedOn } from '@/features/schedules/last-day'
import { PausedScheduleAlert } from '@/features/schedules/medication-detail'
import { ScheduleConfirmDrawer } from '@/features/schedules/schedule-confirm-drawer'
import { magnesium, NOW, TODAY } from './lab-fixtures'
import { doseWhen, firstDoseAfterResume, type PausableSchedule } from './pause-model'

export type SaveStep = 'idle' | 'saving' | 'unknown'

/** The production confirm step in a fixed save state. Nothing saves in the lab. */
export function PauseScheduleDrawer({ state = 'idle' }: { state?: SaveStep }) {
  const [open, setOpen] = useState(true)
  return (
    <ScheduleConfirmDrawer
      command="pause"
      open={open}
      label={magnesium.label}
      pending={state === 'saving'}
      problem={state === 'unknown' ? 'unconfirmed' : undefined}
      onConfirm={() => {}}
      onKeep={() => setOpen(false)}
      onReview={() => setOpen(false)}
    />
  )
}

/** The production schedule card, running or paused, at the lab's fixed clock. */
export function LabScheduleCard({ schedule }: { schedule: PausableSchedule }) {
  return schedule.intervalHours != null ? (
    <IntervalScheduleCard
      hours={schedule.intervalHours}
      anchor={intervalAnchor(schedule)}
      quantity={schedule.times[0].quantity}
      unit={magnesium.unit}
      now={NOW}
      lastDay={schedule.endDate}
      paused={pausedOn(schedule, TODAY)}
    />
  ) : (
    <ClockScheduleCard schedule={schedule} unit={magnesium.unit} today={TODAY} />
  )
}

export const PausedAlert = () => <PausedScheduleAlert label={magnesium.label} />

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
