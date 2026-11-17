import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { PrivateQueryHandoff } from '@/lib/private-query-handoff'
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
import { ScreenStack } from '@/components/layout/screen-stack'
import { AppHeader } from '@/components/layout/app-header'
import { holdRouteRender } from '@/lib/route-render-hold'
import { requestQueryClient } from '@/lib/request-query-client'
import type { DoseOccurrence } from '@/features/schedules/contract'
import { historyDayQuery } from '@/features/schedules/queries'
import { reminderLinkFor, reminderOccurrence } from '@/features/schedules/reminder-link'
import { historyListsReminder } from '@/features/schedules/reminder-destination'
import { ReminderLinkProvider } from '@/features/schedules/reminder-link-provider'

/**
 * One History date's results: its doses and the medicines that name them are read together and
 * only meaningful together, so they stream as one Suspense boundary. Later date changes read in
 * the browser (#132).
 */
async function HistoryDateResults({
  date,
  today,
  notice,
  state,
}: {
  date: string
  today: string
  notice?: 'invalid'
  state?: ReturnType<typeof prefetchHistory>
}) {
  return (
    <PrivateQueryHandoff state={await (state ?? prefetchHistory(date))}>
      <HistoryResults today={today} notice={notice} />
    </PrivateQueryHandoff>
  )
}

export default async function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string | string[]; occurrence?: string | string[] }>
}) {
  await holdRouteRender('history')
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
  const occurrence = reminderOccurrence(query.occurrence)
  if (!session?.user?.id)
    redirect(
      `/?returnTo=${encodeURIComponent(occurrence ? reminderLinkFor(occurrence) : `/history${returnDate ? `?date=${returnDate}` : ''}`)}`,
    )

  // A future or malformed date shows today instead.
  const notice = validDate ? undefined : ('invalid' as const)
  const date = validDate ? (requestedDate as string) : today

  // A Reminder link opens only when this date's read lists its Occurrence; any other link,
  // including another account's, lands on Today with no drawer (#367).
  if (query.occurrence !== undefined && (!occurrence || !validDate)) redirect('/')
  const state = occurrence ? prefetchHistory(date) : undefined
  if (occurrence) {
    await state
    const doses = requestQueryClient().getQueryData<DoseOccurrence[]>(
      historyDayQuery(date).queryKey,
    )
    if (!historyListsReminder(occurrence, date, doses)) redirect('/')
  }

  // The shell, heading and date bar need no reads, so they render before the results stream.
  return (
    <SessionBoundary ownerId={session.user.id} expires={session.expires}>
      <SchedulingClockProvider serverNow={now.toISOString()}>
        <AppShell>
          <ScreenStack>
            <AppHeader title="History" />
            <HistoryDateNav today={today} />
            <ReminderLinkProvider occurrence={occurrence}>
              <Suspense fallback={<HistoryDayFallback date={date} today={today} notice={notice} />}>
                <HistoryDateResults date={date} today={today} notice={notice} state={state} />
              </Suspense>
            </ReminderLinkProvider>
          </ScreenStack>
        </AppShell>
      </SchedulingClockProvider>
    </SessionBoundary>
  )
}
