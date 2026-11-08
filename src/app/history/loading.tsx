import { AppHeader } from '@/components/layout/app-header'
import { AppShell } from '@/components/layout/app-shell'
import { LoadingSection, Skeleton } from '@/components/ui/skeleton'
import { HistoryDaySkeleton } from '@/features/schedules/history-skeleton'

// Before the page resolves its session and date. The date bar needs that date, so it stays a
// placeholder here; once the shell streams, 648·H4 takes over for the results alone. Bare
// /history means today, whose date label wraps on the narrowest phones; shorter labels for earlier
// days fit one line, so those direct loads settle 18px shorter.
export default function Loading() {
  return (
    <AppShell>
      <LoadingSection label="Opening History" className="flex flex-col gap-5 @container">
        <AppHeader title="History" />
        <div className="flex min-w-0 items-center gap-2">
          <Skeleton className="size-11 shrink-0 rounded-lg" />
          <Skeleton className="min-h-12 min-w-0 flex-1 rounded-md text-base @max-[18.5rem]:min-h-[calc(2lh+1.125rem)]" />
          <Skeleton className="size-11 shrink-0 rounded-lg" />
        </div>
        <HistoryDaySkeleton />
      </LoadingSection>
    </AppShell>
  )
}
