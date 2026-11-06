import Link from 'next/link'
import { AppShell } from '@/components/layout/app-shell'
import { auth, authConfigured } from '@/features/auth/server'
import { SessionBoundary } from '@/features/auth/session-boundary'
import { MedicinePanel } from '@/features/medicines/medicine-panel'
import { schedulingNow } from '@/features/schedules/server'

export default async function MedicationsPage({
  searchParams,
}: {
  searchParams: Promise<{ schedule?: string | string[]; medicine?: string | string[] }>
}) {
  const { schedule, medicine } = await searchParams
  const scheduleMedicineId =
    typeof schedule === 'string' && /^[a-f0-9-]{36}$/i.test(schedule) ? schedule : ''
  const detailMedicineId =
    typeof medicine === 'string' && /^[a-f0-9-]{36}$/i.test(medicine) ? medicine : ''
  const returnTo = scheduleMedicineId
    ? `/medications?schedule=${scheduleMedicineId}`
    : detailMedicineId
      ? `/medications?medicine=${detailMedicineId}`
      : '/medications'
  const configured = authConfigured()
  const session = configured ? await auth() : null
  if (!session?.user?.id)
    return (
      <main className="mx-auto max-w-lg space-y-4 px-6 py-12">
        <h1 className="text-2xl font-semibold">Medications</h1>
        <p>Sign in to view your medicines.</p>
        <Link className="underline" href={`/?returnTo=${encodeURIComponent(returnTo)}`}>
          Sign in
        </Link>
      </main>
    )
  return (
    <SessionBoundary expires={session.expires}>
      <AppShell>
        <MedicinePanel
          scheduleMode={scheduleMedicineId ? 'setup' : detailMedicineId ? 'detail' : 'list'}
          scheduleMedicineId={scheduleMedicineId}
          detailMedicineId={detailMedicineId}
          initialNow={schedulingNow().toISOString()}
        />
      </AppShell>
    </SessionBoundary>
  )
}
