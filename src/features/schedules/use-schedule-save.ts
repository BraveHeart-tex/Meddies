'use client'

import { useEffect, useRef, useSyncExternalStore } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { Medicine } from '@/features/medicines/contract'
import { medicationsHref } from '@/features/medicines/routes'
import { requestSave, sessionSaves } from '@/lib/session-saves'
import { isInstant, parseSchedule, parseScheduleEdit, type DailySchedule } from './contract'
import type { IntervalFormOutput } from './interval-form-schema'
import { applySchedule, scheduleKeys } from './queries'
import type { ScheduleFormOutput } from './schedule-form-schema'
import {
  discardScheduleDrafts,
  scheduleDraftBase,
  type ScheduleKind,
} from './schedule-setup-drafts'

function matchingSchedule(value: unknown, payload: Record<string, unknown>): DailySchedule {
  const saved = parseSchedule(value)
  const attempted = parseSchedule(payload)
  const confirmedAt = (value as Record<string, unknown>).confirmedAt
  if (!isInstant(confirmedAt) || JSON.stringify(saved) !== JSON.stringify(attempted))
    throw new Error('Schedule confirmation does not match attempt')
  return { ...saved, confirmedAt }
}

/** A confirmed change must be the attempted Schedule version, whatever dates the server set. */
function matchingChange(value: unknown, payload: Record<string, unknown>): DailySchedule {
  const saved = parseSchedule(value)
  const attempted = parseScheduleEdit(payload)
  const confirmedAt = (value as Record<string, unknown>).confirmedAt
  const same = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right)
  if (
    !isInstant(confirmedAt) ||
    saved.id !== attempted.id ||
    !same(saved.times, attempted.times) ||
    !same(saved.weekdays, attempted.weekdays) ||
    saved.intervalHours !== attempted.intervalHours ||
    saved.endDate !== attempted.endDate ||
    (attempted.anchorDate !== undefined && saved.startDate !== attempted.anchorDate)
  )
    throw new Error('Schedule confirmation does not match attempt')
  return { ...saved, confirmedAt, basedOnId: attempted.basedOnId, replacedAt: null }
}

type ScheduleValues = ScheduleFormOutput | IntervalFormOutput

/**
 * The edit request for a change to `current`. Only an Interval schedule carries a date, and only
 * when its Anchor is new: switched from set times, or Starts changed.
 */
export function scheduleChangePayload(current: DailySchedule, values: ScheduleValues) {
  const intervalHours = 'intervalHours' in values ? values.intervalHours : null
  const newAnchor =
    intervalHours !== null &&
    (current.intervalHours == null ||
      values.startDate !== current.startDate ||
      values.times[0].time !== current.times[0].time)
  return {
    basedOnId: current.id,
    endDate: values.lastDay,
    times: values.times,
    weekdays: values.weekdays,
    intervalHours,
    ...(newAnchor ? { anchorDate: values.startDate } : {}),
  }
}

/** A first schedule's request: the values with their Last day as the contract's `endDate`. */
function setupPayload(medicineId: string, { lastDay, ...values }: ScheduleValues) {
  return { medicineId, ...values, endDate: lastDay }
}

const attemptDate = (payload: Record<string, unknown>) =>
  (payload.startDate ?? payload.anchorDate) as string | undefined

/** Readonly view of a medicine's setup or change save, for screens around the form. */
export function useScheduleAttempt(medicineId: string, current?: DailySchedule) {
  const client = useQueryClient()
  const store = sessionSaves(client)
  const key = scheduleDraftBase(medicineId, current)
  useSyncExternalStore(store.subscribe, store.snapshot, store.snapshot)
  const attempt = store.entries.get(key)
  const pending = attempt?.status === 'pending'
  const retryable = pending || attempt?.result?.problem === 'unconfirmed'
  return {
    pending,
    /** The kind being saved or retried, which setup must reopen on. */
    kind: (retryable
      ? attempt?.payload.intervalHours == null
        ? 'times'
        : 'interval'
      : undefined) as ScheduleKind | undefined,
    clear: () => store.clear(key),
  }
}

/**
 * Setup, or a change to the `current` Schedule version, owns its save through confirmation,
 * independently of the mounted form.
 */
export function useScheduleSave(
  medicine: Medicine,
  onSaved: (schedule: DailySchedule) => void,
  current?: DailySchedule,
) {
  const client = useQueryClient()
  const store = sessionSaves(client)
  const key = scheduleDraftBase(medicine.id, current)
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

  return {
    pending: attempt?.status === 'pending',
    problem: attempt?.result?.problem,
    retryStartDate:
      attempt?.status === 'pending' || attempt?.result?.problem === 'unconfirmed'
        ? attemptDate(attempt.payload)
        : undefined,
    clear: () => store.clear(key),
    submit: (values: ScheduleValues) =>
      store.submit(
        key,
        {
          payload: current
            ? scheduleChangePayload(current, values)
            : setupPayload(medicine.id, values),
          label: medicine.label,
          kind: 'schedule',
          href: medicationsHref({ mode: 'setup', medicineId: medicine.id }),
          openHref: medicationsHref({ mode: 'detail', medicineId: medicine.id }),
        },
        async (payload, active) => {
          const url = current ? '/api/schedules/edit' : '/api/schedules'
          const result = await requestSave(url, payload, (data) => {
            const envelope = data as { schedules?: unknown[] } | null
            const value = envelope?.schedules?.[0]
            return current ? matchingChange(value, payload) : matchingSchedule(value, payload)
          })
          if (result.saved && active()) {
            await client.cancelQueries({ queryKey: scheduleKeys.all })
            if (active()) {
              // Publication is synchronous; the refresh must not prolong or undo confirmation.
              void applySchedule(client, result.saved).catch(() => {})
              discardScheduleDrafts(client, key)
            }
          }
          return result
        },
      ),
  } as const
}
