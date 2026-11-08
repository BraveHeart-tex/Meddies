import { redirect } from 'next/navigation'
import { AppShell } from '@/components/layout/app-shell'
import { auth, authConfigured } from '@/features/auth/server'
import { SessionBoundary } from '@/features/auth/session-boundary'
import { MedicinePanel } from '@/features/medicines/medicine-panel'
import { schedulingNow } from '@/features/schedules/server'

export default async function MedicationsPage({
  searchParams,
}: {
  searchParams: Promise<{
    schedule?: string | string[]
    medicine?: string | string[]
    add?: string | string[]
  }>
}) {
  const { schedule, medicine, add } = await searchParams
  const scheduleMedicineId =
    typeof schedule === 'string' && /^[a-f0-9-]{36}$/i.test(schedule) ? schedule : ''
  const detailMedicineId =
    typeof medicine === 'string' && /^[a-f0-9-]{36}$/i.test(medicine) ? medicine : ''
  const returnTo = scheduleMedicineId
    ? `/medications?schedule=${scheduleMedicineId}`
    : detailMedicineId
      ? `/medications?medicine=${detailMedicineId}`
      : add !== undefined
        ? '/medications?add'
        : '/medications'
  const configured = authConfigured()
  const session = configured ? await auth() : null
  if (!session?.user?.id) redirect(`/?returnTo=${encodeURIComponent(returnTo)}`)
  return (
    <SessionBoundary ownerId={session.user.id} expires={session.expires}>
      <AppShell>
        <MedicinePanel
          scheduleMode={
            scheduleMedicineId
              ? 'setup'
              : detailMedicineId
                ? 'detail'
                : add !== undefined
                  ? 'add'
                  : 'list'
          }
          scheduleMedicineId={scheduleMedicineId}
          detailMedicineId={detailMedicineId}
          initialNow={schedulingNow().toISOString()}
        />
      </AppShell>
    </SessionBoundary>
  )
}
