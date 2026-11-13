'use client'

import { useState } from 'react'
import { ClockScheduleCard } from '@/features/schedules/clock-schedule-card'
import { intervalAnchor } from '@/features/schedules/interval-preview'
import { IntervalScheduleCard } from '@/features/schedules/interval-schedule-card'
import { pausedOn } from '@/features/schedules/last-day'
import { PausedScheduleAlert, ResumedScheduleAlert } from '@/features/schedules/medication-detail'
import { ScheduleConfirmDrawer } from '@/features/schedules/schedule-confirm-drawer'
import { magnesium, NOW, TODAY } from './lab-fixtures'
import type { PausableSchedule } from './pause-model'

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

export const ResumedAlert = ({ schedule }: { schedule: PausableSchedule }) => (
  <ResumedScheduleAlert label={magnesium.label} schedule={schedule} />
)
