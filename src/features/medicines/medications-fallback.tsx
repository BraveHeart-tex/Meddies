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
import {
  MedicationDetailSkeleton,
  MedicationSetupSkeleton,
  MedicationsListSkeleton,
} from './medications-skeleton'
import { medicineKeys } from './queries'

/**
 * Suspense fallback for the streamed Medications section. A warm navigation shows the session's
 * cached view while the server reads; otherwise the view's own skeleton holds its place (647·L2,
 * D1). A cached list without the linked medication isn't proof it's missing, so that waits for
 * the server too.
 */
export function MedicationsFallback() {
  const view = useMedicationsView()
  const medicines = useCachedQueryData<Medicine[]>(medicineKeys.list())
  const snapshot = useCachedQueryData<ScheduleSnapshot>(scheduleKeys.snapshot())
  if (view.mode === 'add') return null
  const linkedMedicineCached =
    view.mode === 'list' || medicines?.some((item) => item.id === view.medicineId)
  return (
    <PendingRouteContext value={true}>
      {medicines && snapshot && linkedMedicineCached ? (
        <MedicationsScreen serverEntry initialNow={snapshot.now} />
      ) : view.mode === 'detail' ? (
        <MedicationDetailSkeleton />
      ) : view.mode === 'setup' ? (
        <MedicationSetupSkeleton />
      ) : (
        <MedicationsListSkeleton />
      )}
    </PendingRouteContext>
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
