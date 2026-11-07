'use client'

import type { ReactNode } from 'react'
import { HydrationBoundary, useQueryClient, type DehydratedState } from '@tanstack/react-query'
import type { DoseOccurrence } from './contract'
import { historyDate, mergeHistoryDay, scheduleKeys } from './queries'

/**
 * Like `TodayHydration` for a History date: a late server read cannot move a confirmed
 * outcome back. Only History doses are arrays, and an empty date has nothing to keep.
 */
export function HistoryHydration({
  state,
  children,
}: {
  state: DehydratedState
  children: ReactNode
}) {
  const client = useQueryClient()
  return (
    <HydrationBoundary
      state={state}
      options={{
        defaultOptions: {
          deserializeData(data) {
            if (!Array.isArray(data) || data.length === 0 || !('dueAt' in data[0])) return data
            const doses = data as DoseOccurrence[]
            const key = scheduleKeys.history(historyDate(doses[0].dueAt))
            return mergeHistoryDay(client.getQueryData(key), doses)
          },
        },
      }}
    >
      {children}
    </HydrationBoundary>
  )
}
