'use client'

import type { Medicine } from '@/features/medicines/contract'
import { medicineKeys } from '@/features/medicines/queries'
import { useCachedQueryData } from '@/lib/use-cached-query-data'
import type { DoseOccurrence } from './contract'
import { HistoryDay } from './history-day'
import { HistoryDayLoading } from './history-skeleton'
import { scheduleKeys } from './queries'

/**
 * Suspense fallback for History's streamed results. A warm navigation shows the session's cached
 * date while the server reads; otherwise the 648·H4 skeleton holds its place. The cache is only
 * watched, so a cold load never starts a browser read of its own.
 */
export function HistoryDayFallback({
  date,
  today,
  notice,
}: {
  date: string
  today: string
  notice?: 'invalid'
}) {
  const doses = useCachedQueryData<DoseOccurrence[]>(scheduleKeys.history(date))
  const medicines = useCachedQueryData<Medicine[]>(medicineKeys.list())
  return doses && medicines ? (
    <HistoryDay
      date={date}
      today={today}
      result={{ status: 'loaded', doses, medicines }}
      notice={notice}
    />
  ) : (
    <HistoryDayLoading />
  )
}
