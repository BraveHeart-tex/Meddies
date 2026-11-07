'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { DailySchedule, DoseOutcomeRecord, Today } from './contract'
import { scheduleToday } from './occurrences'

export type Snapshot = {
  schedules: DailySchedule[]
  records: DoseOutcomeRecord[]
  today: Today | null
}
export type ScheduleSnapshot = ReturnType<typeof useScheduleSnapshot>

/** Owns the schedules snapshot: first load, visible-only 30s and focus refresh, and out-of-order guards. */
export function useScheduleSnapshot(initialNow: string) {
  const [{ schedules, today }, setSnapshot] = useState<Snapshot>({
    schedules: [],
    records: [],
    today: null,
  })
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const mounted = useRef(false)
  const generation = useRef(0)
  // Resolves true when the fresh snapshot was applied.
  const load = useCallback(async (beforeApply?: (snapshot: Snapshot) => void) => {
    const current = ++generation.current
    try {
      const response = await fetch('/api/schedules', {
        cache: 'no-store',
        signal: AbortSignal.timeout(12000),
      })
      if (!response.ok) throw new Error('load')
      const data: Snapshot = await response.json()
      if (!mounted.current || current !== generation.current) return false
      beforeApply?.(data)
      setSnapshot(data)
      setLoadError(false)
      return true
    } catch {
      if (mounted.current && current === generation.current) setLoadError(true)
      return false
    } finally {
      if (mounted.current && current === generation.current) setLoading(false)
    }
  }, [])
  const retry = () => {
    setLoading(true)
    setLoadError(false)
    void load()
  }
  useEffect(() => {
    mounted.current = true
    // Network responses update state after the effect returns.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
    const refresh = () => {
      if (document.visibilityState === 'visible') void load()
    }
    const timer = setInterval(refresh, 30000)
    window.addEventListener('focus', refresh)
    return () => {
      mounted.current = false
      clearInterval(timer)
      window.removeEventListener('focus', refresh)
    }
  }, [load])
  // The server scheduling clock decides Istanbul today, not the device clock.
  const now = today?.now ?? initialNow

  /** Applies a recorded outcome locally after `announce`, then reloads. */
  function applyOutcome(record: DoseOutcomeRecord, announce: () => void) {
    if (!mounted.current) return
    ++generation.current
    announce()
    setSnapshot((current) => {
      const records = [
        ...current.records.filter(
          (item) => item.scheduleId !== record.scheduleId || item.dueAt !== record.dueAt,
        ),
        record,
      ]
      return {
        ...current,
        records,
        today: current.today
          ? scheduleToday(current.schedules, new Date(current.today.now), records)
          : null,
      }
    })
    void load()
  }

  /** Inserts a saved schedule locally and returns the follow-up reload, or nothing once unmounted. */
  function insertSchedule(schedule: DailySchedule) {
    if (!mounted.current) return
    ++generation.current
    setSnapshot((current) => ({
      ...current,
      schedules: [...current.schedules.filter((item) => item.id !== schedule.id), schedule],
    }))
    return load()
  }

  /**
   * Reloads, calling `beforeApply` with the fresh snapshot before it replaces the current one.
   * Resolves true when that snapshot was applied.
   */
  function reconcile(beforeApply: (snapshot: Snapshot) => void) {
    return load(beforeApply)
  }

  return {
    schedules,
    today,
    now,
    loading,
    loadError,
    retry,
    applyOutcome,
    insertSchedule,
    reconcile,
  }
}
