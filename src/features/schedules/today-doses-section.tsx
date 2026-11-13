'use client'

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Medicine } from '@/features/medicines/contract'
import { medicineKeys } from '@/features/medicines/queries'
import { useCachedQueryData } from '@/lib/use-cached-query-data'
import { scheduleKeys, type ScheduleSnapshot } from './queries'
import { SchedulePanel } from './schedule-panel'
import { TodayDosesLoading } from './today-skeleton'

/**
 * Today's interactive section stays outside Suspense (#255). Warm navigation can open a drawer
 * from the session cache while the server reads; streaming only hydrates that same mounted tree.
 * A completed read also releases cold failures to the normal query error/retry path.
 */
const StreamReady = createContext<(() => void) | null>(null)

export function TodayDosesReady() {
  const ready = useContext(StreamReady)
  useEffect(() => {
    ready?.()
  }, [ready])
  return null
}

export function TodayDosesSection({
  initialNow,
  children,
}: {
  initialNow: string
  children?: ReactNode
}) {
  const snapshot = useCachedQueryData<ScheduleSnapshot>(scheduleKeys.snapshot())
  const medicines = useCachedQueryData<Medicine[]>(medicineKeys.list())
  const [ready, setReady] = useState(false)
  const markReady = useCallback(() => setReady(true), [])
  return (
    <StreamReady.Provider value={markReady}>
      {children}
      {ready || (snapshot && medicines) ? (
        <SchedulePanel mode="today" initialNow={initialNow} />
      ) : (
        <TodayDosesLoading />
      )}
    </StreamReady.Provider>
  )
}
