'use client'

import { useState } from 'react'
import { TODAY } from './lab-fixtures'
import {
  clockDoses,
  EVERY_DAY,
  intervalDoses,
  type ClockValues,
  type CurrentSchedule,
  type IntervalValues,
  type ScheduleKind,
} from './edit-lab-model'

/** The edit's local values. Nothing saves; Save is enabled once anything differs from `current`. */
export function useScheduleEdit(
  current: CurrentSchedule,
  initial: { kind?: ScheduleKind; clock?: ClockValues; interval?: IntervalValues } = {},
) {
  const switchedQuantity =
    current.kind === 'times' ? current.clock.times[0].quantity : current.interval.quantity
  const [kind, setKind] = useState<ScheduleKind>(initial.kind ?? current.kind)
  const [clock, setClock] = useState<ClockValues>(
    initial.clock ??
      (current.kind === 'times'
        ? current.clock
        : { weekdays: EVERY_DAY, times: [{ time: '', quantity: switchedQuantity }] }),
  )
  const [interval, setIntervalValues] = useState<IntervalValues>(
    initial.interval ??
      (current.kind === 'interval'
        ? current.interval
        : // Switching kind asks for a new Anchor; the quantity carries over.
          { hours: '', date: TODAY, time: '', quantity: switchedQuantity }),
  )
  const values = kind === 'times' ? clock : interval
  const before = current.kind === 'times' ? current.clock : current.interval
  const changed = kind !== current.kind || JSON.stringify(values) !== JSON.stringify(before)
  return {
    kind,
    setKind,
    clock,
    setClock,
    interval,
    updateInterval: (patch: Partial<IntervalValues>) =>
      setIntervalValues((previous) => ({ ...previous, ...patch })),
    changed,
    doses: kind === 'times' ? clockDoses(clock) : intervalDoses(interval),
  }
}

export type ScheduleEdit = ReturnType<typeof useScheduleEdit>
