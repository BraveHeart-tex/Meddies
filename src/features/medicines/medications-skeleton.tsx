import { LoadingSection, Skeleton } from '@/components/ui/skeleton'
import { MedicationBackRow, medicationsListHref, SubScreenRow } from './medication-sub-screen'

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

/** The identity header's placeholders, each on the line its text will take. */
function IdentitySkeleton({ eyebrow = false }: { eyebrow?: boolean }) {
  return (
    <div className="flex items-start gap-3">
      <Skeleton className="size-11.5 shrink-0 rounded-md" />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        {eyebrow && (
          <div className="flex h-[1lh] items-center text-label">
            <Skeleton className="h-3 w-24 max-w-full rounded-md" />
          </div>
        )}
        <div className="flex h-[1lh] items-center text-title">
          <Skeleton className="h-5.5 w-full rounded-lg" />
        </div>
        <div className="flex h-[1lh] items-center text-body-sm">
          <Skeleton className="h-3.5 w-3/5 rounded-lg" />
        </div>
      </div>
    </div>
  )
}

/** 647·D1's schedule card. */
export function ScheduleCardSkeleton() {
  return <Skeleton className="h-[150px] rounded-2xl" />
}

/** The setup form's area, below the identity header. */
export function ScheduleFormSkeleton() {
  return <Skeleton className="h-[440px] rounded-2xl" />
}

/** 647·D1: the real Back row, then the header and schedule card in their final positions. */
export function MedicationDetailSkeleton() {
  return (
    <LoadingSection label="Loading medication" className="flex flex-col gap-5">
      <MedicationBackRow href={medicationsListHref}>Medications</MedicationBackRow>
      <IdentitySkeleton />
      <ScheduleCardSkeleton />
    </LoadingSection>
  )
}

/**
 * Setup has no frame of its own: D1's header above a form-area block. Back must name the
 * medication (650 Fix 1) and the name isn't known yet, so its text is a placeholder too.
 */
export function MedicationSetupSkeleton() {
  return (
    <LoadingSection label="Loading schedule setup" className="flex flex-col gap-5">
      <SubScreenRow>
        <div className="flex min-h-11.5 flex-1 items-center">
          <Skeleton className="h-4 w-36 max-w-full rounded-md" />
        </div>
      </SubScreenRow>
      <IdentitySkeleton eyebrow />
      <ScheduleFormSkeleton />
    </LoadingSection>
  )
}
