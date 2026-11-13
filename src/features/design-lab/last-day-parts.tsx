'use client'

import { useState } from 'react'
import { LastDayField, LastDayRow } from '@/features/schedules/last-day-controls'
import { ScheduleConfirmDrawer } from '@/features/schedules/schedule-confirm-drawer'
import { magnesium, TODAY } from './lab-fixtures'

type LastDayProps = {
  value: string | null
  onChange: (next: string | null) => void
  min: string
  error?: string
  disabled?: boolean
}

/** The production Last day control each form uses: a field for set times, a row for every few hours. */
export function LastDayControl({
  kind,
  open,
  ...props
}: LastDayProps & { kind: 'times' | 'interval'; open?: boolean }) {
  return kind === 'times' ? (
    <LastDayField {...props} today={TODAY} />
  ) : (
    <LastDayRow {...props} today={TODAY} defaultOpen={open} />
  )
}

export type StopState = 'idle' | 'stopping' | 'unknown'

/** The production confirm step in a fixed save state. Nothing saves in the lab. */
export function StopScheduleDrawer({ state = 'idle' }: { state?: StopState }) {
  const [open, setOpen] = useState(true)
  return (
    <ScheduleConfirmDrawer
      command="stop"
      open={open}
      label={magnesium.label}
      pending={state === 'stopping'}
      problem={state === 'unknown' ? 'unconfirmed' : undefined}
      onConfirm={() => {}}
      onKeep={() => setOpen(false)}
      onReview={() => setOpen(false)}
    />
  )
}
