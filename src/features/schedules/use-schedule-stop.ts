'use client'

import { useEffect, useRef, useSyncExternalStore } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { Medicine } from '@/features/medicines/contract'
import { medicationsHref } from '@/features/medicines/routes'
import { requestSave, sessionSaves } from '@/lib/session-saves'
import { isInstant, parseSchedule, type DailySchedule } from './contract'
import { applySchedule, scheduleKeys } from './queries'

// Keyed by medicine: the confirmed stop replaces the version it stops before the save settles,
// and the payload names that version. A confirmed or reviewed stop clears it.
export const scheduleStopKey = (medicineId: string) => `schedule:stop:${medicineId}`

/** A confirmed stop must be the attempted successor of `basedOnId`, stopped at its Edit time. */
function matchingStop(value: unknown, payload: Record<string, unknown>): DailySchedule {
  const saved = parseSchedule(value)
  const { confirmedAt, stoppedAt } = value as Record<string, unknown>
  if (
    saved.id !== payload.id ||
    !isInstant(confirmedAt) ||
    !isInstant(stoppedAt) ||
    stoppedAt !== confirmedAt
  )
    throw new Error('Schedule stop confirmation does not match attempt')
  return { ...saved, confirmedAt, stoppedAt, basedOnId: payload.basedOnId as string }
}

/**
 * Stop a schedule (#231): owns the save of the stop of `current` through confirmation, like a
 * change. A retry after an unknown result sends the same stop; `onStopped` runs once the server
 * confirms, while this screen watches.
 */
export function useScheduleStop(
  medicine: Medicine,
  current: DailySchedule,
  onStopped: (stopped: DailySchedule) => void,
) {
  const client = useQueryClient()
  const store = sessionSaves(client)
  const key = scheduleStopKey(medicine.id)
  useSyncExternalStore(store.subscribe, store.snapshot, store.snapshot)
  const attempt = store.entries.get(key)
  const handled = useRef<unknown>(undefined)
  useEffect(() => store.observe(key), [store, key])
  useEffect(() => {
    if (!store.active || !attempt?.result?.saved || handled.current === attempt) return
    handled.current = attempt
    onStopped(attempt.result.saved as DailySchedule)
    store.clear(key)
  }, [attempt, key, onStopped, store])

  const problem = attempt?.result?.problem
  return {
    pending: attempt?.status === 'pending',
    /** A definite rejection means the schedule changed, as a stale stop does (767·S2). */
    problem: problem === 'rejected' ? 'conflict' : problem,
    clear: () => store.clear(key),
    stop: () =>
      store.submit(
        key,
        {
          payload: { basedOnId: current.id },
          label: medicine.label,
          kind: 'schedule',
          savedTitle: `Schedule stopped for ${medicine.label}`,
          href: medicationsHref({ mode: 'detail', medicineId: medicine.id }),
          openHref: medicationsHref({ mode: 'detail', medicineId: medicine.id }),
        },
        async (payload, active) => {
          const result = await requestSave('/api/schedules/stop', payload, (data) =>
            matchingStop((data as { schedules?: unknown[] } | null)?.schedules?.[0], payload),
          )
          if (result.saved && active()) {
            await client.cancelQueries({ queryKey: scheduleKeys.all })
            // Publication is synchronous; the refresh must not prolong or undo confirmation.
            if (active()) void applySchedule(client, result.saved).catch(() => {})
          }
          return result
        },
      ),
  } as const
}
