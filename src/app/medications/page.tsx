import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { AppShell } from '@/components/layout/app-shell'
import { ScreenStack } from '@/components/layout/screen-stack'
import { auth, authConfigured } from '@/features/auth/server'
import { SessionBoundary } from '@/features/auth/session-boundary'
import { MedicationsHeader } from '@/features/medicines/medications-header'
import { MedicationsSection, MedicationsReady } from '@/features/medicines/medications-section'
import { medicationsHref, parseMedicationsView } from '@/features/medicines/routes'
import { PrivateQueryHandoff } from '@/lib/private-query-handoff'
import { prefetchMedications } from '@/features/schedules/prefetch'
import { schedulingNow } from '@/features/schedules/server'

/** Data-only handoff: the interactive panel stays mounted outside Suspense. */
async function MedicationsData() {
  const { state } = await prefetchMedications()
  return (
    <PrivateQueryHandoff state={state}>
      <MedicationsReady />
    </PrivateQueryHandoff>
  )
}

export default async function MedicationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const view = parseMedicationsView(await searchParams)
  const configured = authConfigured()
  const session = configured ? await auth() : null
  if (!session?.user?.id) redirect(`/?returnTo=${encodeURIComponent(medicationsHref(view))}`)
  return (
    <SessionBoundary ownerId={session.user.id} expires={session.expires}>
      <AppShell>
        <ScreenStack>
          <MedicationsHeader />
          <MedicationsSection
            initialNow={schedulingNow().toISOString()}
            clientEntry={view.mode === 'add'}
          >
            {view.mode !== 'add' && (
              <Suspense fallback={null}>
                <MedicationsData />
              </Suspense>
            )}
          </MedicationsSection>
        </ScreenStack>
      </AppShell>
    </SessionBoundary>
  )
}
