'use client'

import { createContext, useContext, useEffect, useMemo, useRef, type ReactNode } from 'react'
import { anchoredClock, type Clock } from './anchored-clock'

const SchedulingClockContext = createContext<Clock | null>(null)

/**
 * Client "now" for scheduling, anchored on the server scheduling clock (`schedulingNow()`), which
 * journeys freeze. Pass every new server now (page props, schedules snapshot) to re-anchor.
 * Until the anchor commits, `now()` returns `serverNow` unchanged, so server render and hydration
 * agree; afterwards it advances by monotonic elapsed time. Read it in event handlers, effects or
 * UI that mounts after hydration; render with `serverNow` itself.
 */
export function SchedulingClockProvider({
  serverNow,
  children,
}: {
  serverNow: string
  children: ReactNode
}) {
  const anchor = useRef<{ serverNow: string; clock: Clock } | null>(null)
  useEffect(() => {
    anchor.current = { serverNow, clock: anchoredClock(serverNow) }
  }, [serverNow])
  const clock = useMemo<Clock>(
    () => ({
      now: () =>
        anchor.current?.serverNow === serverNow ? anchor.current.clock.now() : new Date(serverNow),
    }),
    [serverNow],
  )
  return <SchedulingClockContext value={clock}>{children}</SchedulingClockContext>
}

export function useSchedulingClock(): Clock {
  const clock = useContext(SchedulingClockContext)
  if (!clock) throw new Error('useSchedulingClock needs a SchedulingClockProvider')
  return clock
}
