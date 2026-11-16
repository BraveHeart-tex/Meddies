'use client'

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { useCachedQueryData } from '@/lib/use-cached-query-data'
import { scheduleKeys, type ScheduleSnapshot } from '@/features/schedules/queries'
import type { Medicine } from './contract'
import { medicineKeys } from './queries'
import { useMedicationsView } from './medications-nav'
import { MedicationsScreen } from './medications-screen'

const StreamReady = createContext<(() => void) | null>(null)

export function MedicationsReady() {
  const ready = useContext(StreamReady)
  useEffect(() => ready?.(), [ready])
  return null
}

/** Keep the panel and Add Drawer mounted while a data-only handoff streams (#348).
 * Cold data views hold their skeleton until hydration, then expose query retry on failure.
 */
export function MedicationsSection({
  initialNow,
  clientEntry = false,
  children,
}: {
  initialNow: string
  clientEntry?: boolean
  children: ReactNode
}) {
  const medicines = useCachedQueryData<Medicine[]>(medicineKeys.list())
  const snapshot = useCachedQueryData<ScheduleSnapshot>(scheduleKeys.snapshot())
  const view = useMedicationsView()
  const [ready, setReady] = useState(clientEntry)
  const markReady = useCallback(() => setReady(true), [])
  const linkedMedicineCached =
    !('medicineId' in view) || medicines?.some((medicine) => medicine.id === view.medicineId)
  return (
    <StreamReady value={markReady}>
      {children}
      <MedicationsScreen
        initialNow={initialNow}
        serverEntry={!clientEntry}
        loading={!ready && !(medicines && snapshot && linkedMedicineCached)}
      />
    </StreamReady>
  )
}
