import { PrivateReadError } from '@/lib/session-check'
import { useCallback } from 'react'
import { queryOptions, replaceEqualDeep, useQuery, type QueryClient } from '@tanstack/react-query'
import {
  istanbulDate,
  type DailySchedule,
  type DoseOccurrenceKey,
  type DoseOccurrence,
  type DoseOutcomeRecord,
  type Today,
} from './contract'

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
  if (!response.ok) throw new PrivateReadError(response.status)
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
    structuralSharing: (old, next) =>
      mergeHistoryDay(old as DoseOccurrence[] | undefined, next as DoseOccurrence[]),
  })

/** Browser read of the owner's schedules snapshot through the authenticated API route. */
export async function fetchScheduleSnapshot(signal?: AbortSignal): Promise<ScheduleSnapshot> {
  const timeout = AbortSignal.timeout(12000)
  const response = await fetch('/api/schedules', {
    cache: 'no-store',
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
  })
  if (!response.ok) throw new PrivateReadError(response.status)
  return toScheduleSnapshot(await response.json())
}

/**
 * Stale at once (#123): statuses depend on records and the server clock, so every screen
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
  earlierSchedules?: DailySchedule[]
  today: Pick<Today, 'now' | 'date'>
}): ScheduleSnapshot {
  return {
    schedules: [...data.schedules, ...(data.earlierSchedules ?? [])],
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
    schedules: read.data?.schedules.filter((schedule) => !schedule.replacedAt) ?? [],
    loading: !hasSnapshot && !loadError,
    loadError,
    /** A refresh failed; the cached snapshot stays on screen. */
    refreshFailed: hasSnapshot && read.isError,
    refreshing: read.isFetching,
    /** When the cached snapshot last read successfully. */
    updatedAt: read.dataUpdatedAt,
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
export function currentRecord(client: QueryClient, dose: DoseOccurrenceKey) {
  return cachedRecords(client, historyDate(dose.dueAt))
    .filter((item) => sameDose(item, dose))
    .reduce<DoseOutcomeRecord | undefined>(
      (latest, item) => (!latest || (item.revision ?? 0) > (latest.revision ?? 0) ? item : latest),
      undefined,
    )
}

/** The dose's History date: the Istanbul day it was due, whenever it was taken. */
export const historyDate = (dueAt: string) => istanbulDate(new Date(dueAt))

/** Whether two records or occurrences are the same scheduled dose. */
export const sameDose = (left: DoseOccurrenceKey, right: DoseOccurrenceKey) =>
  left.scheduleId === right.scheduleId && left.dueAt === right.dueAt

/** The confirmed records a History date read shows. */
export const historyRecords = (doses: DoseOccurrence[]) =>
  doses.flatMap((dose) => ('record' in dose ? [dose.record] : []))

/** Whether a query key is one History date's doses. */
export const isHistoryKey = (queryKey: readonly unknown[]) =>
  queryKey.length === 3 && queryKey[0] === scheduleKeys.all[0] && queryKey[1] === 'history'

/** Every cached confirmed record from Today and the History dates, or only `date`'s. */
export function cachedRecords(client: QueryClient, date?: string) {
  const snapshot = client.getQueryData<ScheduleSnapshot>(scheduleKeys.snapshot())
  const days = client.getQueriesData<DoseOccurrence[]>({
    queryKey: date ? scheduleKeys.history(date) : [...scheduleKeys.all, 'history'],
  })
  return [...(snapshot?.records ?? []), ...days.flatMap(([, doses]) => historyRecords(doses ?? []))]
}

/** Like `mergeSnapshot` for one History date: a recorded outcome only advances its revision. */
export function mergeHistoryDay(
  current: DoseOccurrence[] | undefined,
  incoming: DoseOccurrence[],
): DoseOccurrence[] {
  if (!current) return incoming
  const doses = incoming.map((dose) => {
    const previous = current.find((item) => sameDose(item, dose))
    if (!previous || !('record' in previous)) return dose
    if ('record' in dose && (dose.record.revision ?? 0) > (previous.record.revision ?? 0))
      return dose
    return { ...dose, status: previous.status, record: previous.record } as DoseOccurrence
  })
  return replaceEqualDeep(current, doses)
}

/**
 * Writes a confirmed record into Today's cached snapshot when the dose is due on its date and
 * into the dose's cached History date. Returns the keys it covers. Never moves a revision back.
 */
export function writeRecord(client: QueryClient, record: DoseOutcomeRecord) {
  const date = historyDate(record.dueAt)
  const snapshot = client.getQueryData<ScheduleSnapshot>(scheduleKeys.snapshot())
  const dueToday = !snapshot || snapshot.date === date
  if (snapshot && dueToday)
    client.setQueryData<ScheduleSnapshot>(scheduleKeys.snapshot(), (current) =>
      mergeSnapshot(current, {
        ...snapshot,
        records: [...snapshot.records.filter((item) => !sameDose(item, record)), record],
      }),
    )
  client.setQueryData<DoseOccurrence[]>(
    scheduleKeys.history(date),
    (current) =>
      current &&
      mergeHistoryDay(
        current,
        current.map((dose) =>
          sameDose(dose, record)
            ? ({ ...dose, status: record.outcome, record } as DoseOccurrence)
            : dose,
        ),
      ),
  )
  return [...(dueToday ? [scheduleKeys.snapshot()] : []), scheduleKeys.history(date)]
}

/** A confirmed outcome replaces that occurrence's record, then fresh reads reconcile its keys. */
export function applyRecord(client: QueryClient, record: DoseOutcomeRecord) {
  const keys = writeRecord(client, record)
  // Cancels older in-flight reads so they cannot overwrite the confirmed record.
  return Promise.all(
    keys.map((queryKey) => client.invalidateQueries({ queryKey, exact: true })),
  ).then(() => undefined)
}

/**
 * A confirmed schedule replaces or appends that schedule, and a confirmed change ends the version
 * it edits at its Edit time. Then a fresh read reconciles.
 */
export function applySchedule(client: QueryClient, schedule: DailySchedule) {
  client.setQueryData<ScheduleSnapshot>(
    scheduleKeys.snapshot(),
    (current) =>
      current && {
        ...current,
        schedules: [
          ...current.schedules
            .filter((item) => item.id !== schedule.id)
            .map((item) =>
              item.id === schedule.basedOnId ? { ...item, replacedAt: schedule.confirmedAt } : item,
            ),
          schedule,
        ],
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

/** `readFreshSnapshot` for one History date. */
export async function readFreshHistoryDay(client: QueryClient, date: string) {
  await client.cancelQueries({ queryKey: scheduleKeys.history(date), exact: true })
  return client.fetchQuery(historyDayQuery(date))
}
