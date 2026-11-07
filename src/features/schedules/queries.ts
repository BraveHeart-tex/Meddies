import { useCallback } from 'react'
import { queryOptions, replaceEqualDeep, useQuery, type QueryClient } from '@tanstack/react-query'
import type { DailySchedule, DoseOccurrence, DoseOutcomeRecord, Today } from './contract'

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
  /** One History date's doses. */
  history: (date: string) => [...scheduleKeys.all, 'history', date] as const,
}

/** A failed browser read; `status` lets a screen tell an ended session (401) from an outage. */
export class ScheduleReadError extends Error {
  constructor(readonly status: number) {
    super('schedules_read_failed')
  }
}

/** Browser read of one History date's doses through the authenticated API route. */
export async function fetchHistoryDay(
  date: string,
  signal?: AbortSignal,
): Promise<DoseOccurrence[]> {
  const timeout = AbortSignal.timeout(12000)
  const response = await fetch(`/api/schedules/history?date=${encodeURIComponent(date)}`, {
    cache: 'no-store',
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
  })
  if (!response.ok) throw new ScheduleReadError(response.status)
  const data: { doses: DoseOccurrence[] } = await response.json()
  return data.doses
}

/**
 * Stale at once, like the Today snapshot: a revisited date shows its cached doses and refreshes
 * quietly. No polling; default gc time. The page's server prefetch is the entry read.
 */
export const historyDayQuery = (date: string) =>
  queryOptions({
    queryKey: scheduleKeys.history(date),
    queryFn: ({ signal }) => fetchHistoryDay(date, signal),
    staleTime: 0,
  })

/** Browser read of the owner's schedules snapshot through the authenticated API route. */
export async function fetchScheduleSnapshot(signal?: AbortSignal): Promise<ScheduleSnapshot> {
  const timeout = AbortSignal.timeout(12000)
  const response = await fetch('/api/schedules', {
    cache: 'no-store',
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
  })
  if (!response.ok) throw new Error('schedules_read_failed')
  return toScheduleSnapshot(await response.json())
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
    structuralSharing: (old, next) =>
      mergeSnapshot(old as ScheduleSnapshot | undefined, next as ScheduleSnapshot),
  })

/** The schedules API body as the cached snapshot. Shared by the browser read and server prefetch. */
export function toScheduleSnapshot(data: {
  schedules: DailySchedule[]
  records: DoseOutcomeRecord[]
  today: Pick<Today, 'now' | 'date'>
}): ScheduleSnapshot {
  return {
    schedules: data.schedules,
    records: data.records,
    now: data.today.now,
    date: data.today.date,
  }
}

/**
 * Reads the cached snapshot; loading and load error apply only until the session has one.
 * `serverEntry`: the page's server prefetch is the entry read (Today), so mounting with cached
 * or just-hydrated data does not read again; focus, reconnect and mutations still reconcile.
 */
export function useScheduleSnapshot({ serverEntry = false }: { serverEntry?: boolean } = {}) {
  const read = useQuery({ ...scheduleSnapshotQuery(), refetchOnMount: !serverEntry })
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

/** Immutable outcomes never disappear, and a revision can only advance within a dated snapshot. */
export function mergeSnapshot(
  current: ScheduleSnapshot | undefined,
  incoming: ScheduleSnapshot,
): ScheduleSnapshot {
  if (!current) return incoming
  if (incoming.date < current.date) return current
  if (incoming.date !== current.date) return incoming
  const records = [...incoming.records]
  for (const previous of current.records) {
    const index = records.findIndex(
      (record) => record.scheduleId === previous.scheduleId && record.dueAt === previous.dueAt,
    )
    if (index < 0) records.push(previous)
    else if ((records[index].revision ?? 0) <= (previous.revision ?? 0)) records[index] = previous
  }
  return replaceEqualDeep(current, { ...incoming, records })
}

/** Current confirmed outcome, used to distinguish an old receipt from the latest outcome. */
export function currentRecord(
  client: QueryClient,
  record: Pick<DoseOutcomeRecord, 'scheduleId' | 'dueAt'>,
) {
  return client
    .getQueryData<ScheduleSnapshot>(scheduleKeys.snapshot())
    ?.records.find((item) => item.scheduleId === record.scheduleId && item.dueAt === record.dueAt)
}

/** A confirmed outcome replaces that occurrence's record, then a fresh read reconciles. */
export function applyRecord(client: QueryClient, record: DoseOutcomeRecord) {
  client.setQueryData<ScheduleSnapshot>(
    scheduleKeys.snapshot(),
    (current) =>
      current &&
      mergeSnapshot(current, {
        ...current,
        records: [
          ...current.records.filter(
            (item) => item.scheduleId !== record.scheduleId || item.dueAt !== record.dueAt,
          ),
          record,
        ],
      }),
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
