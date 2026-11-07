import { Suspense } from 'react'
import Link from 'next/link'
import { HydrationBoundary } from '@tanstack/react-query'
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
    <HydrationBoundary state={await prefetchHistory(date)}>
      <HistoryResults today={today} notice={notice} />
    </HydrationBoundary>
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
  if (!configured || !session?.user?.id) {
    return (
      <main className="mx-auto max-w-lg space-y-4 px-6 py-12">
        <p>
          {configured ? 'Sign in to view dose history.' : 'Sign-in is temporarily unavailable.'}
        </p>
        <Link
          className="underline"
          href={`/?returnTo=${encodeURIComponent(returnDate ? `/history?date=${returnDate}` : '/history')}`}
        >
          Sign in
        </Link>
      </main>
    )
  }

  // A future or malformed date shows today instead (648·H6).
  const notice = validDate ? undefined : ('invalid' as const)
  const date = validDate ? (requestedDate as string) : today

  // The shell, heading and date bar need no reads, so they render before the results stream.
  return (
    <SessionBoundary ownerId={session.user.id} expires={session.expires}>
      <SchedulingClockProvider serverNow={now.toISOString()}>
        <AppShell>
          <AppHeader title="History" />
          <HistoryDateNav today={today} />
          <Suspense fallback={<HistoryDayFallback date={date} today={today} notice={notice} />}>
            <HistoryDateResults date={date} today={today} notice={notice} />
          </Suspense>
        </AppShell>
      </SchedulingClockProvider>
    </SessionBoundary>
  )
}
