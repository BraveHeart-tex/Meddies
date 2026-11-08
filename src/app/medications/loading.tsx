import { AppShell } from '@/components/layout/app-shell'
import { MedicationsRouteFallback } from '@/features/medicines/medications-fallback'

export default function Loading() {
  return (
    <AppShell>
      <MedicationsRouteFallback />
    </AppShell>
  )
}
