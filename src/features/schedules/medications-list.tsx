'use client'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button, buttonVariants } from '@/components/ui/button'
import { Item } from '@/components/ui/item'
import { formatTime } from '@/lib/calendar-date'
import { MedicationsLink } from '@/features/medicines/medications-nav'
import { MedicationsListSkeleton } from '@/features/medicines/medications-skeleton'
import type { MedicinesRead } from '@/features/medicines/queries'
import { medicationsHref } from '@/features/medicines/routes'
import { MedicationRoutineGroups } from './medication-routine-groups'
import type { SchedulesRead } from './queries'

/**
 * The list's loading, content, empty and recovery states. Failure of either read is one alert with
 * one Retry. Rows need both reads, because a medicine with an unknown schedule must not read as
 * having none.
 */
export function MedicationsList({
  medicinesRead,
  schedulesRead,
  focusMedicineId,
  onMedicineFocused,
}: {
  medicinesRead: MedicinesRead
  schedulesRead: SchedulesRead
  focusMedicineId?: string | null
  onMedicineFocused?: () => void
}) {
  const reads = [medicinesRead, schedulesRead]
  const unavailable = reads.some((read) => read.loadError)
  const usable = reads.every((read) => !read.loading && !read.loadError)
  const refreshFailed = usable && reads.some((read) => read.refreshFailed)
  const refreshing = reads.some((read) => read.refreshing)
  // The list is only as recent as the older of its two reads.
  const loadedAt = Math.min(medicinesRead.updatedAt, schedulesRead.updatedAt)

  function retry() {
    for (const read of reads) if (read.loadError || read.refreshFailed) read.retry()
  }

  const recovery = (message: string) => (
    <Alert role="alert">
      <AlertDescription className="flex flex-col items-start gap-2 text-foreground">
        <p>{message}</p>
        <Button variant="outline" className="min-h-11" disabled={refreshing} onClick={retry}>
          {refreshing ? 'Retrying…' : 'Retry'}
        </Button>
      </AlertDescription>
    </Alert>
  )

  return (
    <section aria-labelledby="medicine-routines-heading" className="flex flex-col gap-4">
      <h2 id="medicine-routines-heading" className="sr-only">
        Your medications
      </h2>
      {unavailable ? (
        recovery("Your medications didn't load just now. Check your connection and try again.")
      ) : !usable ? (
        <MedicationsListSkeleton />
      ) : (
        <>
          {refreshFailed &&
            recovery(
              `Your medications didn't update just now. Showing what loaded at ${formatTime(loadedAt)}.`,
            )}
          {medicinesRead.medicines.length === 0 ? (
            <Item variant="dashed" className="flex-col items-start gap-3 p-5">
              <h3 className="text-title font-extrabold">No medications here yet.</h3>
              <p className="text-muted-foreground">
                Add your first one whenever you&apos;re ready.
              </p>
              <MedicationsLink
                href={medicationsHref({ mode: 'add' })}
                keepScroll
                className={buttonVariants({ size: 'lg' })}
              >
                Add medication
              </MedicationsLink>
            </Item>
          ) : (
            <MedicationRoutineGroups
              medicines={medicinesRead.medicines}
              schedules={schedulesRead.schedules}
              focusMedicineId={focusMedicineId}
              onMedicineFocused={onMedicineFocused}
            />
          )}
        </>
      )}
    </section>
  )
}
