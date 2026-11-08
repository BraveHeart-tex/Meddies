'use client'

import { useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ScheduleSnapshot } from '@/features/schedules/queries'
import { scheduleKeys } from '@/features/schedules/queries'
import { activeSessionQueryClient } from '@/lib/session-query-client'
import { useCachedQueryData } from '@/lib/use-cached-query-data'
import type { Medicine } from './contract'
import { MedicationsHeader } from './medications-header'
import { PendingRouteContext, useMedicationsView } from './medications-nav'
import { MedicationsScreen } from './medications-screen'
import { MedicationsListSkeleton } from './medications-skeleton'
import { medicineKeys } from './queries'

/**
 * Suspense fallback for the streamed Medications section. A warm navigation shows the session's
 * cached list while the server reads; otherwise 647·L2 holds its place. Detail and setup links
 * never show the list skeleton.
 */
export function MedicationsFallback() {
  const view = useMedicationsView()
  const medicines = useCachedQueryData<Medicine[]>(medicineKeys.list())
  const snapshot = useCachedQueryData<ScheduleSnapshot>(scheduleKeys.snapshot())
  if (view.mode !== 'list') return null
  return medicines && snapshot ? (
    <PendingRouteContext value={true}>
      <MedicationsScreen serverEntry initialNow={snapshot.now} />
    </PendingRouteContext>
  ) : (
    <MedicationsListSkeleton />
  )
}

/**
 * Before the page has resolved its session. Only the live session's in-memory client can hold
 * data here, and session end clears it; a cold load gets an empty client and the skeleton.
 */
export function MedicationsRouteFallback() {
  const [client] = useState(() => activeSessionQueryClient() ?? new QueryClient())
  return (
    <QueryClientProvider client={client}>
      <PendingRouteContext value={true}>
        <div className="flex flex-col gap-5">
          <MedicationsHeader />
          <MedicationsFallback />
        </div>
      </PendingRouteContext>
    </QueryClientProvider>
  )
}
