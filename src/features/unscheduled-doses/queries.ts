// Unscheduled doses by History date. Today's snapshot read and each History date read carry
// their date's Unscheduled doses and seed this cache family; it has no read of its own.
import { useCallback } from 'react'
import { replaceEqualDeep, skipToken, useQuery, type QueryClient } from '@tanstack/react-query'
import { takenDate, type UnscheduledDose } from './contract'

export const unscheduledKeys = {
  /** One History date's Unscheduled doses, under the schedules family so it ends with it. */
  day: (date: string) => ['schedules', 'unscheduled', date] as const,
}

/** Whether a query key is one date's Unscheduled doses. */
export const isUnscheduledKey = (queryKey: readonly unknown[]) =>
  queryKey.length === 3 &&
  queryKey[0] === 'schedules' &&
  queryKey[1] === 'unscheduled' &&
  typeof queryKey[2] === 'string'

/**
 * A read replaces the date's list, but a cached revision newer than the read's (a confirmed
 * change or removal) wins, so a stale read never brings a removed dose back.
 */
export function mergeUnscheduledDay(
  current: UnscheduledDose[] | undefined,
  incoming: UnscheduledDose[],
): UnscheduledDose[] {
  if (!current) return incoming
  return replaceEqualDeep(
    current,
    incoming.map((dose) => {
      const cached = current.find((item) => item.id === dose.id)
      return cached && cached.revision > dose.revision ? cached : dose
    }),
  )
}

/** Seeds a date's list from a Today or History read. */
export function seedUnscheduledDay(client: QueryClient, date: string, doses: UnscheduledDose[]) {
  client.setQueryData<UnscheduledDose[]>(unscheduledKeys.day(date), (current) =>
    mergeUnscheduledDay(current, doses),
  )
}

/**
 * Writes a confirmed dose, change or removal into the date it lands on and the date it left.
 * A removal or a dose moved to another date stays cached at its new revision and is filtered
 * out when shown. Never moves a revision back.
 */
export function writeUnscheduledDose(
  client: QueryClient,
  dose: UnscheduledDose,
  previous?: UnscheduledDose,
) {
  const dates = new Set([takenDate(dose), ...(previous ? [takenDate(previous)] : [])])
  for (const date of dates)
    client.setQueryData<UnscheduledDose[]>(unscheduledKeys.day(date), (current = []) => {
      const cached = current.find((item) => item.id === dose.id)
      if (cached && cached.revision >= dose.revision) return current
      return [...current.filter((item) => item.id !== dose.id), dose]
    })
  return [...dates]
}

/** The doses a date shows: not removed, taken on that date, in time order. */
export function shownUnscheduled(doses: UnscheduledDose[] | undefined, date: string) {
  return (doses ?? [])
    .filter((dose) => !dose.removed && takenDate(dose) === date)
    .sort((a, b) => a.takenAt.localeCompare(b.takenAt) || a.id.localeCompare(b.id))
}

const none: UnscheduledDose[] = []

/** A date's Unscheduled doses from the cache. Observed, so the list stays while it shows. */
export function useUnscheduledDoses(date: string) {
  const select = useCallback((doses: UnscheduledDose[]) => shownUnscheduled(doses, date), [date])
  const { data } = useQuery({ queryKey: unscheduledKeys.day(date), queryFn: skipToken, select })
  return data ?? none
}
