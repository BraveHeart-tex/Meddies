import { LoadingSection, Skeleton } from '@/components/ui/skeleton'

/**
 * Today's sections before any schedule data arrives (648·T1): the next-dose hero, the doses
 * heading and three rows, with the loaded layout's radii, minimum heights and gaps.
 */
export function TodaySkeleton() {
  return (
    <div className="flex flex-col gap-5">
      <Skeleton tone="blush" className="min-h-44 rounded-3xl" />
      <div className="flex flex-col gap-3.5">
        <div className="flex h-[1lh] items-center px-1 text-heading">
          <Skeleton className="h-4.5 w-2/5 rounded-lg" />
        </div>
        <div className="flex flex-col gap-2.5">
          {[0, 1, 2].map((row) => (
            <Skeleton key={row} className="min-h-16 rounded-2xl" />
          ))}
        </div>
      </div>
    </div>
  )
}

/**
 * The doses section before its data arrives: one polite status over the Today skeleton. The
 * streamed page's Suspense fallback and Today's own client loading state both use it.
 */
export function TodayDosesLoading() {
  return (
    <LoadingSection label="Loading today’s doses">
      <TodaySkeleton />
    </LoadingSection>
  )
}
