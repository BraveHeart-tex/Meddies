'use client'

import { useEffect, useRef, useSyncExternalStore } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { Medicine } from '@/features/medicines/contract'
import { medicationsHref } from '@/features/medicines/routes'
import { discardSessionFormDraft } from '@/lib/session-drafts'
import { requestSave, sessionSaves } from '@/lib/session-saves'
import { isInstant, parseSchedule, type DailySchedule } from './contract'
import { applySchedule, scheduleKeys } from './queries'
import type { ScheduleFormOutput } from './schedule-form-schema'

export const scheduleSetupKey = (medicineId: string) => `schedule:setup:${medicineId}`

function matchingSchedule(value: unknown, payload: Record<string, unknown>): DailySchedule {
  const saved = parseSchedule(value)
  const attempted = parseSchedule(payload)
  const confirmedAt = (value as Record<string, unknown>).confirmedAt
  if (!isInstant(confirmedAt) || JSON.stringify(saved) !== JSON.stringify(attempted))
    throw new Error('Schedule confirmation does not match attempt')
  return { ...saved, confirmedAt }
}

/** Initial setup owns the save through confirmation, independently of the mounted form. */
export function useScheduleSave(medicine: Medicine, onSaved: (schedule: DailySchedule) => void) {
  const client = useQueryClient()
  const store = sessionSaves(client)
  const key = scheduleSetupKey(medicine.id)
  useSyncExternalStore(store.subscribe, store.snapshot, store.snapshot)
  const attempt = store.entries.get(key)
  const handled = useRef<unknown>(undefined)
  useEffect(() => store.observe(key), [store, key])
  useEffect(() => {
    if (!store.active || !attempt?.result?.saved || handled.current === attempt) return
    handled.current = attempt
    onSaved(matchingSchedule(attempt.result.saved, attempt.payload))
    store.clear(key)
  }, [attempt, key, onSaved, store])

  return {
    pending: attempt?.status === 'pending',
    problem: attempt?.result?.problem,
    retryStartDate:
      attempt?.status === 'pending' || attempt?.result?.problem === 'unconfirmed'
        ? (attempt.payload.startDate as string)
        : undefined,
    clear: () => store.clear(key),
    submit: (values: ScheduleFormOutput) =>
      store.submit(
        key,
        {
          payload: { medicineId: medicine.id, ...values },
          label: medicine.label,
          kind: 'schedule',
          href: medicationsHref({ mode: 'setup', medicineId: medicine.id }),
          openHref: medicationsHref({ mode: 'detail', medicineId: medicine.id }),
        },
        async (payload, active) => {
          const result = await requestSave('/api/schedules', payload, (data) => {
            const envelope = data as { schedules?: unknown[] } | null
            return matchingSchedule(envelope?.schedules?.[0], payload)
          })
          if (result.saved && active()) {
            await client.cancelQueries({ queryKey: scheduleKeys.all })
            if (active()) {
              // Publication is synchronous; the refresh must not prolong or undo confirmation.
              void applySchedule(client, result.saved).catch(() => {})
              discardSessionFormDraft(client, key)
            }
          }
          return result
        },
      ),
  } as const
}
