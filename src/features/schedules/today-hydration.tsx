'use client'

import type { ReactNode } from 'react'
import { HydrationBoundary, useQueryClient, type DehydratedState } from '@tanstack/react-query'
import { mergeSnapshot, scheduleKeys, type ScheduleSnapshot } from './queries'

/** Hydration sets state directly, bypassing Query's structural sharing. Merge at hydration time. */
export function TodayHydration({
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
            if (data && typeof data === 'object' && 'schedules' in data && 'records' in data) {
              return mergeSnapshot(
                client.getQueryData(scheduleKeys.snapshot()),
                data as ScheduleSnapshot,
              )
            }
            return data
          },
        },
      }}
    >
      {children}
    </HydrationBoundary>
  )
}
