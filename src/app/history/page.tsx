import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { HistoryHydration } from '@/features/schedules/history-hydration'
import { auth, authConfigured } from '@/features/auth/server'
import { SessionBoundary } from '@/features/auth/session-boundary'
import { schedulingNow } from '@/features/schedules/server'
import { prefetchHistory } from '@/features/schedules/prefetch'
import { isScheduleDate, istanbulDate } from '@/features/schedules/contract'
import { HistoryDateNav } from '@/features/schedules/history-date-nav'
import { HistoryDayFallback } from '@/features/schedules/history-day-fallback'
import { HistoryResults } from '@/features/schedules/history-results'
import { SchedulingClockProvider } from '@/features/schedules/scheduling-clock'
import { AppShell } from '@/components/layout/app-shell'
import { AppHeader } from '@/components/layout/app-header'

/**
 * One History date's results: its doses and the medicines that name them are read together and
 * only meaningful together, so they stream as one Suspense boundary. Later date changes read in
 * the browser (FE-679).
 */
async function HistoryDateResults({
  date,
  today,
  notice,
}: {
  date: string
  today: string
  notice?: 'invalid'
}) {
  return (
    <HistoryHydration state={await prefetchHistory(date)}>
      <HistoryResults today={today} notice={notice} />
    </HistoryHydration>
  )
}

export default async function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string | string[] }>
}) {
  const query = await searchParams
  const now = schedulingNow()
  const today = istanbulDate(now)
  // Bare /history means today; repeated `date` params are invalid.
  const requestedDate = query.date ?? today
  const validDate =
    typeof requestedDate === 'string' && isScheduleDate(requestedDate) && requestedDate <= today
  const returnDate = typeof query.date === 'string' && validDate ? query.date : ''
  const configured = authConfigured()
  const session = configured ? await auth() : null
  if (!session?.user?.id)
    redirect(
      `/?returnTo=${encodeURIComponent(`/history${returnDate ? `?date=${returnDate}` : ''}`)}`,
    )

  // A future or malformed date shows today instead (648·H6).
  const notice = validDate ? undefined : ('invalid' as const)
  const date = validDate ? (requestedDate as string) : today

  // The shell, heading and date bar need no reads, so they render before the results stream.
  return (
    <SessionBoundary ownerId={session.user.id} expires={session.expires}>
      <SchedulingClockProvider serverNow={now.toISOString()}>
        <AppShell>
          {/* Today's 20px section column, so the header stays put between tabs (FE-690). */}
          <div className="flex flex-col gap-5">
            <AppHeader title="History" />
            <HistoryDateNav today={today} />
            <Suspense fallback={<HistoryDayFallback date={date} today={today} notice={notice} />}>
              <HistoryDateResults date={date} today={today} notice={notice} />
            </Suspense>
          </div>
        </AppShell>
      </SchedulingClockProvider>
    </SessionBoundary>
  )
}
