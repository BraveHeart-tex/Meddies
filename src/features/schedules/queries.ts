import { useCallback } from 'react'
import { queryOptions, useQuery, type QueryClient } from '@tanstack/react-query'
import type { DailySchedule, DoseOutcomeRecord, Today } from './contract'

/** The owner's schedules and the server's Today records, at the server scheduling time `now`. */
export type ScheduleSnapshot = {
  schedules: DailySchedule[]
  records: DoseOutcomeRecord[]
  /** Server scheduling time of the read; re-anchors the scheduling clock. */
  now: string
  /** Istanbul date the records cover. */
  date: string
}

/** Shared schedule query keys. Mutations update and reconcile these exact keys. */
export const scheduleKeys = {
  all: ['schedules'] as const,
  snapshot: () => [...scheduleKeys.all, 'snapshot'] as const,
}

/** Browser read of the owner's schedules snapshot through the authenticated API route. */
export async function fetchScheduleSnapshot(signal?: AbortSignal): Promise<ScheduleSnapshot> {
  const timeout = AbortSignal.timeout(12000)
  const response = await fetch('/api/schedules', {
    cache: 'no-store',
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
  })
  if (!response.ok) throw new Error('schedules_read_failed')
  const data: { schedules: DailySchedule[]; records: DoseOutcomeRecord[]; today: Today } =
    await response.json()
  return {
    schedules: data.schedules,
    records: data.records,
    now: data.today.now,
    date: data.today.date,
  }
}

/**
 * Stale at once (FE-670): statuses depend on records and the server clock, so every screen
 * entry, focus and reconnect reconciles while cached content stays. No polling; due-time and
 * day rollover advance locally from the scheduling clock.
 */
export const scheduleSnapshotQuery = () =>
  queryOptions({
    queryKey: scheduleKeys.snapshot(),
    queryFn: ({ signal }) => fetchScheduleSnapshot(signal),
    staleTime: 0,
  })

/** Reads the cached snapshot; loading and load error apply only until the session has one. */
export function useScheduleSnapshot() {
  const read = useQuery(scheduleSnapshotQuery())
  const { refetch } = read
  const retry = useCallback(() => void refetch(), [refetch])
  // Joins an in-flight read instead of restarting it.
  const ensureFresh = useCallback(() => void refetch({ cancelRefetch: false }), [refetch])
  const hasSnapshot = read.data !== undefined
  const loadError = !hasSnapshot && read.isError && !read.isFetching
  return {
    snapshot: read.data,
    schedules: read.data?.schedules ?? [],
    loading: !hasSnapshot && !loadError,
    loadError,
    /** A refresh failed; the cached snapshot stays on screen. */
    refreshFailed: hasSnapshot && read.isError,
    refreshing: read.isFetching,
    retry,
    ensureFresh,
  }
}

export type SchedulesRead = ReturnType<typeof useScheduleSnapshot>

/** A confirmed outcome replaces that occurrence's record, then a fresh read reconciles. */
export function applyRecord(client: QueryClient, record: DoseOutcomeRecord) {
  client.setQueryData<ScheduleSnapshot>(
    scheduleKeys.snapshot(),
    (current) =>
      current && {
        ...current,
        records: [
          ...current.records.filter(
            (item) => item.scheduleId !== record.scheduleId || item.dueAt !== record.dueAt,
          ),
          record,
        ],
      },
  )
  // Cancels older in-flight reads so they cannot overwrite the confirmed record.
  return client.invalidateQueries({ queryKey: scheduleKeys.all })
}

/** A confirmed schedule replaces or appends that schedule, then a fresh read reconciles. */
export function applySchedule(client: QueryClient, schedule: DailySchedule) {
  client.setQueryData<ScheduleSnapshot>(
    scheduleKeys.snapshot(),
    (current) =>
      current && {
        ...current,
        schedules: [...current.schedules.filter((item) => item.id !== schedule.id), schedule],
      },
  )
  return client.invalidateQueries({ queryKey: scheduleKeys.all })
}

/**
 * A read that starts now, never one already in flight, so it reflects writes made before the
 * call. Updates the cache; rejects when the read fails.
 */
export async function readFreshSnapshot(client: QueryClient) {
  await client.cancelQueries({ queryKey: scheduleKeys.snapshot() })
  return client.fetchQuery(scheduleSnapshotQuery())
}
