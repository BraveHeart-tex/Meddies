'use client'

import { useEffect, useRef, useSyncExternalStore } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { Medicine } from '@/features/medicines/contract'
import { medicationsHref } from '@/features/medicines/routes'
import { requestSave, sessionSaves } from '@/lib/session-saves'
import { isInstant, parseSchedule, type DailySchedule } from './contract'
import { applySchedule, scheduleKeys } from './queries'
import type { ScheduleConfirmKind } from './schedule-confirm-drawer'

// Keyed by medicine: the confirmed save replaces the version it names before the save settles,
// and the payload names that version. A confirmed or reviewed save clears it.
export const scheduleCommandKey = (command: ScheduleConfirmKind, medicineId: string) =>
  `schedule:${command}:${medicineId}`

const field = { stop: 'stoppedAt', pause: 'pausedAt' } as const
const savedTitle = { stop: 'Schedule stopped for', pause: 'Schedule paused for' } as const

/** A confirmed save must be the attempted successor of `basedOnId`, stopped or paused at its Edit time. */
function matchingSave(
  command: ScheduleConfirmKind,
  value: unknown,
  payload: Record<string, unknown>,
): DailySchedule {
  const saved = parseSchedule(value)
  const { confirmedAt, [field[command]]: at } = value as Record<string, unknown>
  if (saved.id !== payload.id || !isInstant(confirmedAt) || !isInstant(at) || at !== confirmedAt)
    throw new Error(`Schedule ${command} confirmation does not match attempt`)
  return {
    ...saved,
    confirmedAt,
    [field[command]]: at,
    basedOnId: payload.basedOnId as string,
  }
}

/**
 * Stop (#231) or pause (#236) a schedule: owns the save of `command` on `current` through
 * confirmation, like a change. A retry after an unknown result sends the same save; `onSaved`
 * runs once the server confirms, while this screen watches.
 */
export function useScheduleCommand(
  command: ScheduleConfirmKind,
  medicine: Medicine,
  current: DailySchedule,
  onSaved: (saved: DailySchedule) => void,
) {
  const client = useQueryClient()
  const store = sessionSaves(client)
  const key = scheduleCommandKey(command, medicine.id)
  useSyncExternalStore(store.subscribe, store.snapshot, store.snapshot)
  const attempt = store.entries.get(key)
  const handled = useRef<unknown>(undefined)
  useEffect(() => store.observe(key), [store, key])
  useEffect(() => {
    if (!store.active || !attempt?.result?.saved || handled.current === attempt) return
    handled.current = attempt
    onSaved(attempt.result.saved as DailySchedule)
    store.clear(key)
  }, [attempt, key, onSaved, store])

  const problem = attempt?.result?.problem
  const detailHref = medicationsHref({ mode: 'detail', medicineId: medicine.id })
  return {
    pending: attempt?.status === 'pending',
    /** A definite rejection means the schedule changed, as a stale save does (215·S2). */
    problem: problem === 'rejected' ? 'conflict' : problem,
    clear: () => store.clear(key),
    save: () =>
      store.submit(
        key,
        {
          payload: { basedOnId: current.id },
          label: medicine.label,
          kind: 'schedule',
          savedTitle: `${savedTitle[command]} ${medicine.label}`,
          href: detailHref,
          openHref: detailHref,
        },
        async (payload, active) => {
          const result = await requestSave(`/api/schedules/${command}`, payload, (data) =>
            matchingSave(
              command,
              (data as { schedules?: unknown[] } | null)?.schedules?.[0],
              payload,
            ),
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
