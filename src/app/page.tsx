import { Suspense } from 'react'
import { PrivateQueryHandoff } from '@/lib/private-query-handoff'
import { auth, authConfigured } from '@/features/auth/server'
import { SignInScreen } from '@/features/auth/sign-in-screen'
import { safeReturnTo, saveInProgressNotice } from '@/features/auth/return-to'
import { redirect } from 'next/navigation'
import { SessionBoundary } from '@/features/auth/session-boundary'
import { AppShell } from '@/components/layout/app-shell'
import { ScreenStack } from '@/components/layout/screen-stack'
import { schedulingNow } from '@/features/schedules/server'
import { prefetchToday } from '@/features/schedules/prefetch'
import { TodayHeader } from '@/features/schedules/today-header'
import { TodayDosesReady, TodayDosesSection } from '@/features/schedules/today-doses-section'

/**
 * Today's doses section: the next-dose hero and the dose list derive from the same two reads,
 * so they stream as one Suspense boundary rather than two that always resolve together.
 */
async function TodayDoses() {
  return (
    <PrivateQueryHandoff state={await prefetchToday()}>
      <TodayDosesReady />
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
    // The shell and header need no reads, so they render before the doses stream (#125).
    return (
      <SessionBoundary ownerId={session.user.id} expires={session.expires}>
        <AppShell>
          <ScreenStack>
            <TodayHeader initialNow={initialNow} />
            <TodayDosesSection initialNow={initialNow}>
              <Suspense fallback={null}>
                <TodayDoses />
              </Suspense>
            </TodayDosesSection>
          </ScreenStack>
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
