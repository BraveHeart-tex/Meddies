import { AppHeaderSkeleton } from '@/components/layout/app-header'
import { AppShell } from '@/components/layout/app-shell'
import { LoadingSection } from '@/components/ui/skeleton'
import { TodaySkeleton } from '@/features/schedules/today-skeleton'

// Cold launch (FE-649 L1). The fallback knows neither the session nor the route, so every first
// load shows Today's layout until the page arrives.
export default function Loading() {
  return (
    <AppShell>
      <LoadingSection label="Opening Meddies" className="flex flex-col gap-5">
        <AppHeaderSkeleton />
        <TodaySkeleton />
      </LoadingSection>
    </AppShell>
  )
}
