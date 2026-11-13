'use client'

import { useState, type ReactNode } from 'react'
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query'
import type { Medicine } from '@/features/medicines/contract'
import { medicineKeys } from '@/features/medicines/queries'
import type { DoseOccurrence } from '@/features/schedules/contract'
import { scheduleKeys, type ScheduleSnapshot } from '@/features/schedules/queries'
import { createQueryClient } from '@/lib/session-query-client'

export type QueryFixtures = {
  /** When the fixtures were read: the server scheduling time they show. */
  now: string
  medicines?: Medicine[]
  snapshot?: ScheduleSnapshot
  /** History days by Istanbul date. */
  history?: Record<string, DoseOccurrence[]>
}

/**
 * A Query client seeded from typed fixtures, with no network reads: seeded data never goes stale,
 * and a read that runs anyway (a retry, an invalidation) answers from the cache. Every fixture is
 * stamped as read at `now`, so the server render and hydration agree.
 */
export function fixtureQueryClient({ now, medicines, snapshot, history = {} }: QueryFixtures) {
  const client = createQueryClient()
  const defaults = client.defaultQueryOptions.bind(client)
  client.defaultQueryOptions = ((options) => ({
    ...defaults(options),
    staleTime: 'static',
    queryFn: ({ queryKey }) => cached(client, queryKey),
  })) as typeof defaults
  const updatedAt = Date.parse(now)
  if (medicines) client.setQueryData(medicineKeys.list(), medicines, { updatedAt })
  if (snapshot) client.setQueryData(scheduleKeys.snapshot(), snapshot, { updatedAt })
  for (const [date, doses] of Object.entries(history))
    client.setQueryData(scheduleKeys.history(date), doses, { updatedAt })
  return client
}

function cached(client: QueryClient, queryKey: readonly unknown[]) {
  const data = client.getQueryData(queryKey)
  if (data === undefined) throw new Error(`No lab fixture for ${JSON.stringify(queryKey)}`)
  return data
}

/** Provides a frame's seeded Query client in place of the session's. */
export function FixtureQuery({ children, ...fixtures }: QueryFixtures & { children: ReactNode }) {
  const [client] = useState(() => fixtureQueryClient(fixtures))
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}
