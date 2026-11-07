import Link from 'next/link'
import { auth, authConfigured } from '@/features/auth/server'
import { SessionBoundary } from '@/features/auth/session-boundary'
import { medicines } from '@/features/medicines/server'
import { ApplicationError } from '@/lib/application-error'
import { schedules, schedulingNow } from '@/features/schedules/server'
import { isScheduleDate, istanbulDate } from '@/features/schedules/contract'
import { HistoryDateNav } from '@/features/schedules/history-date-nav'
import { HistoryDay, type HistoryDayResult } from '@/features/schedules/history-day'
import { SchedulingClockProvider } from '@/features/schedules/scheduling-clock'
import { AppShell } from '@/components/layout/app-shell'
import { AppHeader } from '@/components/layout/app-header'

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
  let result: HistoryDayResult
  try {
    const [doses, medicineList] = await Promise.all([schedules.history(date), medicines.list()])
    result = { status: 'loaded', doses, medicines: medicineList }
  } catch (error) {
    result =
      error instanceof ApplicationError && error.code === 'unauthorized'
        ? { status: 'unauthorized' }
        : { status: 'unavailable' }
  }

  return (
    <SessionBoundary ownerId={session.user.id} expires={session.expires}>
      <SchedulingClockProvider serverNow={now.toISOString()}>
        <AppShell>
          <AppHeader title="History" />
          <HistoryDateNav date={date} today={today} />
          <HistoryDay key={date} date={date} today={today} result={result} notice={notice} />
        </AppShell>
      </SchedulingClockProvider>
    </SessionBoundary>
  )
}
