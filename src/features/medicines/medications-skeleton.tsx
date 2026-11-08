import { LoadingSection, Skeleton } from '@/components/ui/skeleton'

/**
 * 647·L2: four static rows. The blank line holds the first group label's place without guessing
 * which group the rows belong to.
 */
export function MedicationsListSkeleton() {
  return (
    <LoadingSection label="Loading medications" className="flex flex-col gap-2.5">
      <div aria-hidden="true" className="px-1 pt-1 text-label leading-none">
        &nbsp;
      </div>
      {[0, 1, 2, 3].map((row) => (
        <Skeleton key={row} className="h-[76px] rounded-2xl" />
      ))}
    </LoadingSection>
  )
}
