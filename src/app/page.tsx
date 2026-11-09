import { Suspense } from 'react'
import { PrivateQueryHandoff } from '@/lib/private-query-handoff'
import { auth, authConfigured } from '@/features/auth/server'
import { SignInScreen } from '@/features/auth/sign-in-screen'
import { safeReturnTo, saveInProgressNotice } from '@/features/auth/return-to'
import { redirect } from 'next/navigation'
import { SessionBoundary } from '@/features/auth/session-boundary'
import { AppShell } from '@/components/layout/app-shell'
import { schedulingNow } from '@/features/schedules/server'
import { prefetchToday } from '@/features/schedules/prefetch'
import { SchedulePanel } from '@/features/schedules/schedule-panel'
import { TodayHeader } from '@/features/schedules/today-header'
import { TodayDosesFallback } from '@/features/schedules/today-doses-fallback'

/**
 * Today's doses section: the next-dose hero and the dose list derive from the same two reads,
 * so they stream as one Suspense boundary rather than two that always resolve together.
 */
async function TodayDoses({ initialNow }: { initialNow: string }) {
  return (
    <PrivateQueryHandoff state={await prefetchToday()}>
      <SchedulePanel mode="today" initialNow={initialNow} />
    </PrivateQueryHandoff>
  )
}

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{
    error?: string | string[]
    reason?: string | string[]
    returnTo?: string | string[]
    notice?: string | string[]
  }>
}) {
  const configured = authConfigured()
  const session = configured ? await auth() : null
  const { error, reason, returnTo, notice } = await searchParams
  const destination = safeReturnTo(returnTo)
  if (session?.user?.id) {
    if (destination !== '/') redirect(destination)
    const initialNow = schedulingNow().toISOString()
    // The shell and header need no reads, so they render before the doses stream (FE-672).
    return (
      <SessionBoundary ownerId={session.user.id} expires={session.expires}>
        <AppShell>
          <div className="flex flex-col gap-5">
            <TodayHeader initialNow={initialNow} />
            <Suspense fallback={<TodayDosesFallback initialNow={initialNow} />}>
              <TodayDoses initialNow={initialNow} />
            </Suspense>
          </div>
        </AppShell>
      </SessionBoundary>
    )
  }
  return (
    <SignInScreen
      configured={configured}
      error={typeof error === 'string' ? error : undefined}
      reason={typeof reason === 'string' ? reason : undefined}
      returnTo={destination}
      saveInProgress={notice === saveInProgressNotice}
    />
  )
}
