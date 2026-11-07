'use client'

import { useEffect, useState } from 'react'
import { useSchedulingClock } from './scheduling-clock'

/**
 * The scheduling-clock instant for status display: `serverNow` at render, then advanced on each
 * minute boundary, so due-time and day rollover need no server read. A new `serverNow`
 * (re-anchor) takes over at once.
 */
export function useScheduleNow(serverNow: string) {
  const clock = useSchedulingClock()
  const [anchored, setAnchored] = useState({ serverNow, now: serverNow })
  if (anchored.serverNow !== serverNow) setAnchored({ serverNow, now: serverNow })
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>
    const next = () => {
      timer = setTimeout(
        () => {
          setAnchored((current) => ({ ...current, now: clock.now().toISOString() }))
          next()
        },
        60_000 - (clock.now().getTime() % 60_000) + 50,
      )
    }
    next()
    return () => clearTimeout(timer)
  }, [clock])
  return anchored.serverNow === serverNow ? anchored.now : serverNow
}
