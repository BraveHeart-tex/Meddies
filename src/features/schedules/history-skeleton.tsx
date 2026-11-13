import { HistoryInvalidDateNotice } from './history-invalid-date-notice'
import { LoadingSection, Skeleton } from '@/components/ui/skeleton'

/** One day's heading and three rows with the loaded layout's gaps, radii and minimum heights. */
export function HistoryDaySkeleton() {
  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex h-[1lh] items-center px-1 text-heading">
        <Skeleton className="h-4.5 w-1/2 rounded-lg" />
      </div>
      <div className="flex flex-col gap-2.5">
        {[0, 1, 2].map((row) => (
          <Skeleton key={row} className="min-h-16 rounded-2xl" />
        ))}
      </div>
    </div>
  )
}

/**
 * One History date's results before they arrive, under one polite status. The date bar
 * above stays real, so nothing here stands in for it.
 */
export function HistoryDayLoading({ notice }: { notice?: 'invalid' }) {
  return (
    <>
      {notice === 'invalid' && <HistoryInvalidDateNotice />}
      <LoadingSection label="Loading history">
        <HistoryDaySkeleton />
      </LoadingSection>
    </>
  )
}
