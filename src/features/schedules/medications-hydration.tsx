'use client'

import type { ReactNode } from 'react'
import { HydrationBoundary, useQueryClient, type DehydratedState } from '@tanstack/react-query'
import type { Medicine } from '@/features/medicines/contract'
import { medicineKeys, mergeMedicines } from '@/features/medicines/queries'
import { mergeSnapshot, scheduleKeys, type ScheduleSnapshot } from './queries'

/**
 * Hydration sets state directly, bypassing Query's structural sharing, so a late server read is
 * merged here: it cannot drop a confirmed medicine or move a confirmed dose back.
 */
export function MedicationsHydration({
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
            if (Array.isArray(data))
              return mergeMedicines(
                client.getQueryData<Medicine[]>(medicineKeys.list()),
                data as Medicine[],
              )
            return mergeSnapshot(
              client.getQueryData(scheduleKeys.snapshot()),
              data as ScheduleSnapshot,
            )
          },
        },
      }}
    >
      {children}
    </HydrationBoundary>
  )
}
