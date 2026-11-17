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
import { requestQueryClient } from '@/lib/request-query-client'
import { scheduleKeys, type ScheduleSnapshot } from '@/features/schedules/queries'
import { reminderLinkFor, reminderOccurrence } from '@/features/schedules/reminder-link'
import { reminderDestination } from '@/features/schedules/reminder-destination'
import { ReminderLinkProvider } from '@/features/schedules/reminder-link-provider'

/**
 * Today's doses section: the next-dose hero and the dose list derive from the same two reads,
 * so they stream as one Suspense boundary rather than two that always resolve together.
 */
async function TodayDoses({ state }: { state?: ReturnType<typeof prefetchToday> }) {
  return (
    <PrivateQueryHandoff state={await (state ?? prefetchToday())}>
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
    occurrence?: string | string[]
  }>
}) {
  const configured = authConfigured()
  const session = configured ? await auth() : null
  const { error, reason, returnTo, notice, occurrence: link } = await searchParams
  const occurrence = reminderOccurrence(link)
  const destination = occurrence ? reminderLinkFor(occurrence) : safeReturnTo(returnTo)
  if (session?.user?.id) {
    if (link !== undefined && !occurrence) redirect('/')
    if (!occurrence && destination !== '/') redirect(destination)
    // A Reminder link waits for Today's read to know whether Today lists its Occurrence (#367).
    const state = occurrence ? prefetchToday() : undefined
    if (occurrence) {
      await state
      const snapshot = requestQueryClient().getQueryData<ScheduleSnapshot>(scheduleKeys.snapshot())
      const opens = reminderDestination(occurrence, snapshot)
      if (opens !== 'today') redirect(opens)
    }
    const initialNow = schedulingNow().toISOString()
    // The shell and header need no reads, so they render before the doses stream (#125).
    return (
      <SessionBoundary ownerId={session.user.id} expires={session.expires}>
        <AppShell>
          <ScreenStack>
            <TodayHeader initialNow={initialNow} givenName={session.user.givenName} />
            <ReminderLinkProvider occurrence={occurrence}>
              <TodayDosesSection initialNow={initialNow}>
                <Suspense fallback={null}>
                  <TodayDoses state={state} />
                </Suspense>
              </TodayDosesSection>
            </ReminderLinkProvider>
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
