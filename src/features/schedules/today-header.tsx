'use client'

import { AppHeader } from '@/components/layout/app-header'
import { useCachedQueryData } from '@/lib/use-cached-query-data'
import { formatLongDay } from '@/lib/calendar-date'
import { greeting } from './next-dose'
import { scheduleKeys, type ScheduleSnapshot } from './queries'
import { SchedulingClockProvider } from './scheduling-clock'
import { useScheduleNow } from './use-schedule-now'

/** The latest server scheduling time: the cached snapshot's when newer than `initialNow`. */
function useLatestServerNow(initialNow: string) {
  const snapshotNow = useCachedQueryData<ScheduleSnapshot>(scheduleKeys.snapshot())?.now
  return snapshotNow && snapshotNow > initialNow ? snapshotNow : initialNow
}

/**
 * Today's header (day label and greeting). It needs only the server scheduling time, so it
 * renders in the shell before the doses stream, and re-anchors on each newer snapshot.
 */
export function TodayHeader({ initialNow }: { initialNow: string }) {
  const serverNow = useLatestServerNow(initialNow)
  return (
    <SchedulingClockProvider serverNow={serverNow}>
      <TodayHeading serverNow={serverNow} />
    </SchedulingClockProvider>
  )
}

function TodayHeading({ serverNow }: { serverNow: string }) {
  const now = useScheduleNow(serverNow)
  return <AppHeader eyebrow={now ? formatLongDay(now, now) : undefined} title={greeting(now)} />
}
