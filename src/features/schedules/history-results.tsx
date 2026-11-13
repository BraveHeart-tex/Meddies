'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useMedicines } from '@/features/medicines/queries'
import { HistoryDay } from './history-day'
import { requestDayFocus, useHistoryDate } from './history-date-nav'
import { HistoryDayLoading } from './history-skeleton'
import { historyDayQuery } from './queries'

/**
 * The selected History date's results, owned by Query after hydration. The date comes from the
 * URL, so Previous, Next and the DatePicker change it without a server round trip: a cached date
 * shows at once and refreshes quietly, an uncached one shows the results fallback while it reads.
 * `notice` is the server's invalid-date notice for the date first shown.
 */
export function HistoryResults({ today, notice }: { today: string; notice?: 'invalid' }) {
  const date = useHistoryDate(today)
  // The server prefetch is the entry read, so the first mount does not read again. A date change
  // still reads, because the query is stale at once.
  const day = useQuery({ ...historyDayQuery(date), refetchOnMount: false })
  const medicines = useMedicines()
  const [entryDate] = useState(date)
  const [left, setLeft] = useState(false)
  if (!left && date !== entryDate) setLeft(true)
  const shownNotice = left ? undefined : notice

  const dayError = day.data === undefined && day.isError && !day.isFetching
  if (dayError || medicines.loadError) {
    const retry = () => {
      // The alert and its button give way to the loading state, so focus follows to the day.
      requestDayFocus()
      if (dayError) void day.refetch()
      if (medicines.loadError) medicines.retry()
    }
    return (
      // Keyed apart from the loaded day, so a recovered day mounts and takes focus.
      <HistoryDay
        key={`${date}:unavailable`}
        date={date}
        today={today}
        result={{ status: 'unavailable', retry }}
        notice={shownNotice}
      />
    )
  }
  if (day.data === undefined || medicines.loading) return <HistoryDayLoading notice={shownNotice} />
  return (
    <HistoryDay
      key={date}
      date={date}
      today={today}
      result={{ status: 'loaded', doses: day.data, medicines: medicines.medicines }}
      notice={shownNotice}
    />
  )
}
