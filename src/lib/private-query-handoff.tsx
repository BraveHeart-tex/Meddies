'use client'

import type { ReactNode } from 'react'
import { HydrationBoundary, useQueryClient, type DehydratedState } from '@tanstack/react-query'
import { medicineKeys, mergeMedicines } from '@/features/medicines/queries'
import type { Medicine } from '@/features/medicines/contract'
import {
  scheduleKeys,
  mergeHistoryDay,
  mergeSnapshot,
  type ScheduleSnapshot,
} from '@/features/schedules/queries'
import type { DoseOccurrence } from '@/features/schedules/contract'
import type { UnscheduledDose } from '@/features/unscheduled-doses/contract'
import { isUnscheduledKey, mergeUnscheduledDay } from '@/features/unscheduled-doses/queries'

/** Every private query family must choose its merge (or explicit replacement) policy here. */
function mergePolicy(key: readonly unknown[]): (current: unknown, incoming: unknown) => unknown {
  if (key.length === 2 && key[0] === medicineKeys.all[0] && key[1] === medicineKeys.list()[1])
    return (current, incoming) =>
      mergeMedicines(current as Medicine[] | undefined, incoming as Medicine[])
  if (key.length === 2 && key[0] === scheduleKeys.all[0] && key[1] === scheduleKeys.snapshot()[1])
    return (current, incoming) =>
      mergeSnapshot(current as ScheduleSnapshot | undefined, incoming as ScheduleSnapshot)
  if (
    key.length === 3 &&
    key[0] === scheduleKeys.all[0] &&
    key[1] === 'history' &&
    typeof key[2] === 'string'
  )
    return (current, incoming) =>
      mergeHistoryDay(current as DoseOccurrence[] | undefined, incoming as DoseOccurrence[])
  if (isUnscheduledKey(key))
    return (current, incoming) =>
      mergeUnscheduledDay(current as UnscheduledDose[] | undefined, incoming as UnscheduledDose[])
  throw new Error(`Private query needs an explicit handoff policy: ${JSON.stringify(key)}`)
}

/**
 * One boundary per key gives Query's data-only deserializer the matching policy.
 * Read the live cache when hydration applies, never premerge during render: existing
 * queries hydrate after commit, and a save may confirm before that effect runs.
 */
export function PrivateQueryHandoff({
  state,
  children,
}: {
  state: DehydratedState
  children: ReactNode
}) {
  const client = useQueryClient()
  return state.queries.reduceRight<ReactNode>((content, query) => {
    const merge = mergePolicy(query.queryKey)
    return (
      <HydrationBoundary
        key={query.queryHash}
        state={{ mutations: [], queries: [query] }}
        options={{
          defaultOptions: {
            deserializeData: (incoming) => merge(client.getQueryData(query.queryKey), incoming),
          },
        }}
      >
        {content}
      </HydrationBoundary>
    )
  }, children)
}
