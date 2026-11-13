'use client'

import { useEffect, useRef, useSyncExternalStore } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { Medicine } from '@/features/medicines/contract'
import { medicationsHref } from '@/features/medicines/routes'
import { requestSave, sessionSaves } from '@/lib/session-saves'
import { isInstant, parseSchedule, type DailySchedule } from './contract'
import { applySchedule, scheduleKeys } from './queries'
import type { ScheduleConfirmKind } from './schedule-confirm-drawer'

export type ScheduleCommandKind = ScheduleConfirmKind | 'resume'
/** An Interval schedule's new Anchor on resume (233·A9). */
export type ResumeAnchor = { anchorDate: string; anchorTime: string }

// Keyed by medicine: the confirmed save replaces the version it names before the save settles,
// and the payload names that version. A confirmed or reviewed save clears it.
export const scheduleCommandKey = (command: ScheduleCommandKind, medicineId: string) =>
  `schedule:${command}:${medicineId}`

const savedTitle = {
  stop: 'Schedule stopped for',
  pause: 'Schedule paused for',
  resume: 'Schedule resumed for',
} as const

/**
 * A confirmed save must be the attempted successor of `basedOnId`: stopped or paused at its Edit
 * time, or running again from the attempted Anchor.
 */
function matchingSave(
  command: ScheduleCommandKind,
  value: unknown,
  payload: Record<string, unknown>,
): DailySchedule {
  const saved = parseSchedule(value)
  const raw = value as Record<string, unknown>
  const { confirmedAt } = raw
  const fail = () => {
    throw new Error(`Schedule ${command} confirmation does not match attempt`)
  }
  if (saved.id !== payload.id || !isInstant(confirmedAt)) fail()
  const basedOnId = payload.basedOnId as string
  if (command === 'resume') {
    const anchored = payload.anchorDate !== undefined
    if (
      raw.pausedAt ||
      raw.stoppedAt ||
      (anchored &&
        (raw.anchorDate !== payload.anchorDate || saved.times[0]?.time !== payload.anchorTime))
    )
      fail()
    return {
      ...saved,
      confirmedAt: confirmedAt as string,
      ...(anchored ? { anchorDate: payload.anchorDate as string } : {}),
      pausedAt: null,
      stoppedAt: null,
      basedOnId,
    }
  }
  const field = command === 'stop' ? 'stoppedAt' : 'pausedAt'
  const at = raw[field]
  if (!isInstant(at) || at !== confirmedAt) fail()
  return { ...saved, confirmedAt: confirmedAt as string, [field]: at, basedOnId }
}

/**
 * Stop (#231), pause (#236) or resume (#237) a schedule: owns the save of `command` on `current`
 * through confirmation, like a change. A retry after an unknown result sends the same save;
 * `onSaved` runs once the server confirms, while a screen watches.
 */
export function useScheduleCommand(
  command: ScheduleCommandKind,
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
    /** An Interval schedule's resume sends its new `anchor`. */
    save: (anchor?: ResumeAnchor) =>
      store.submit(
        key,
        {
          payload: { basedOnId: current.id, ...anchor },
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
