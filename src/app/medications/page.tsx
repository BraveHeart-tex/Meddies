import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { AppShell } from '@/components/layout/app-shell'
import { auth, authConfigured } from '@/features/auth/server'
import { SessionBoundary } from '@/features/auth/session-boundary'
import { MedicationsFallback } from '@/features/medicines/medications-fallback'
import { MedicationsHeader } from '@/features/medicines/medications-header'
import { MedicationsScreen } from '@/features/medicines/medications-screen'
import { medicationsHref, parseMedicationsView } from '@/features/medicines/routes'
import { MedicationsHydration } from '@/features/schedules/medications-hydration'
import { prefetchMedications } from '@/features/schedules/prefetch'
import { schedulingNow } from '@/features/schedules/server'

/**
 * The medicines and schedules every data view shares, read together in one section so the panel
 * stays mounted across views (FE-625). Add reads nothing, so its form never waits.
 */
async function MedicationsSection({ add, initialNow }: { add: boolean; initialNow: string }) {
  const read = add ? { state: { mutations: [], queries: [] }, complete: false } : null
  const { state, complete } = read ?? (await prefetchMedications())
  return (
    <MedicationsHydration state={state}>
      <MedicationsScreen initialNow={initialNow} serverEntry={complete} />
    </MedicationsHydration>
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
        <div className="flex flex-col gap-5">
          <MedicationsHeader />
          <Suspense fallback={<MedicationsFallback />}>
            <MedicationsSection
              add={view.mode === 'add'}
              initialNow={schedulingNow().toISOString()}
            />
          </Suspense>
        </div>
      </AppShell>
    </SessionBoundary>
  )
}
