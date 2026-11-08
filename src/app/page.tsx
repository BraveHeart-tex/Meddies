import { Suspense } from 'react'
import { TodayHydration } from '@/features/schedules/today-hydration'
import { auth, authConfigured } from '@/features/auth/server'
import { AuthControl } from '@/features/auth/controls'
import { SessionBoundary } from '@/features/auth/session-boundary'
import { AppShell } from '@/components/layout/app-shell'
import { schedulingNow } from '@/features/schedules/server'
import { prefetchToday } from '@/features/schedules/prefetch'
import { SchedulePanel } from '@/features/schedules/schedule-panel'
import { TodayHeader } from '@/features/schedules/today-header'
import { TodayDosesFallback } from '@/features/schedules/today-doses-fallback'
import { saveMessages } from '@/lib/save-messages'

/**
 * Today's doses section: the next-dose hero and the dose list derive from the same two reads,
 * so they stream as one Suspense boundary rather than two that always resolve together.
 */
async function TodayDoses({ initialNow }: { initialNow: string }) {
  return (
    <TodayHydration state={await prefetchToday()}>
      <SchedulePanel mode="today" initialNow={initialNow} />
    </TodayHydration>
  )
}

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{
    error?: string | string[]
    reason?: string | string[]
    returnTo?: string | string[]
  }>
}) {
  const configured = authConfigured()
  const session = configured ? await auth() : null
  const { error, reason, returnTo } = await searchParams
  const safeReturnTo = (() => {
    if (typeof returnTo !== 'string' || /[\\\u0000-\u001f]/.test(returnTo)) return '/'
    if (['/', '/medications', '/medications?add', '/settings'].includes(returnTo)) return returnTo
    if (/^\/history(?:\?date=\d{4}-\d{2}-\d{2})?$/.test(returnTo)) return returnTo
    return /^\/medications\?(?:medicine|schedule)=[a-f0-9-]{36}$/i.test(returnTo) ? returnTo : '/'
  })()
  if (session?.user?.id) {
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
    <main className="mx-auto flex min-h-svh max-w-lg flex-col gap-6 px-6 py-12">
      <h1 className="text-3xl font-semibold tracking-tight">Meddies</h1>
      <>
        <div className="space-y-3">
          <h2 className="text-xl font-medium">Your routine, in your hands</h2>
          <p>Sign in with your approved Google account to enter Meddies.</p>
          <p className="text-sm text-muted-foreground">
            Meddies is private. Access is limited to the approved account.
          </p>
        </div>
        <p role="status">
          {!configured
            ? 'Sign-in is temporarily unavailable. Please try again later.'
            : error === 'AccessDenied'
              ? "This account can't open Meddies. Try your approved Google account."
              : error
                ? "Sign-in didn't finish. Please try again."
                : reason === 'expired'
                  ? `${saveMessages.sessionEnded} Please sign in again.`
                  : reason === 'signed-out'
                    ? 'You’re signed out.'
                    : ''}
        </p>
        {configured && <AuthControl returnTo={safeReturnTo} />}
      </>
    </main>
  )
}
