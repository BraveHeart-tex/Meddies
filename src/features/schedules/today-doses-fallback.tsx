'use client'

import type { Medicine } from '@/features/medicines/contract'
import { medicineKeys } from '@/features/medicines/queries'
import { useCachedQueryData } from '@/lib/use-cached-query-data'
import { scheduleKeys, type ScheduleSnapshot } from './queries'
import { SchedulePanel } from './schedule-panel'
import { TodayDosesLoading } from './today-skeleton'

/**
 * Suspense fallback for Today's streamed doses section. A warm navigation shows the session's
 * cached doses while the server reads; otherwise the 648·T1 skeleton holds the section's place.
 * The cache is only watched, so a cold load never starts a browser read of its own.
 */
export function TodayDosesFallback({ initialNow }: { initialNow: string }) {
  const snapshot = useCachedQueryData<ScheduleSnapshot>(scheduleKeys.snapshot())
  const medicines = useCachedQueryData<Medicine[]>(medicineKeys.list())
  return snapshot && medicines ? (
    <SchedulePanel mode="today" initialNow={initialNow} />
  ) : (
    <TodayDosesLoading />
  )
}
