'use client'

import { useEffect, useState } from 'react'
import { useSchedulingClock } from './scheduling-clock'
import { localMinute } from './taken-form-schema'

/** The Istanbul minute on the scheduling clock, advanced on each minute while `ticking`. */
export function useCurrentMinute(ticking: boolean) {
  const clock = useSchedulingClock()
  // Mounts with the drawer, after hydration, so the anchored clock is safe to read here.
  const [minute, setMinute] = useState(() => localMinute(clock.now().toISOString()))
  useEffect(() => {
    if (!ticking) return
    // Syncs at once, as a re-anchored clock may have jumped, then on each minute boundary.
    const tick = () => {
      setMinute(localMinute(clock.now().toISOString()))
      timer = setTimeout(tick, 60_000 - (clock.now().getTime() % 60_000) + 50)
    }
    let timer = setTimeout(tick, 0)
    return () => clearTimeout(timer)
  }, [clock, ticking])
  return minute
}
