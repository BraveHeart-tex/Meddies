'use client'

import { useEffect, useRef } from 'react'
import { ChevronRightIcon } from 'lucide-react'
import { MedicationTile } from '@/features/medicines/medication-tile'
import { buttonVariants } from '@/components/ui/button'
import { Item, ItemContent, ItemDescription, ItemTitle } from '@/components/ui/item'
import type { Medicine } from '@/features/medicines/contract'
import { MedicationsLink } from '@/features/medicines/medications-nav'
import { medicationSetupHref, medicationsHref } from '@/features/medicines/routes'
import type { DailySchedule } from './contract'

import { ALL_WEEKDAYS, weekdaySummary } from './weekdays'

function routineSummary(schedule: DailySchedule) {
  return [
    weekdaySummary(schedule.weekdays ?? ALL_WEEKDAYS, 'short'),
    schedule.times.map((slot) => slot.time).join(', '),
  ].join(' · ')
}

export function MedicationRoutineGroups({
  medicines,
  schedules,
  focusMedicineId,
  onMedicineFocused,
}: {
  medicines: Medicine[]
  schedules: DailySchedule[]
  /** The row to focus once, when the list shows after Done for now (647·B1). */
  focusMedicineId?: string | null
  onMedicineFocused?: () => void
}) {
  const focusRow = useRef<HTMLAnchorElement>(null)
  useEffect(() => {
    if (!focusMedicineId || !focusRow.current) return
    focusRow.current.focus()
    onMedicineFocused?.()
  }, [focusMedicineId, onMedicineFocused])
  const routines = medicines.map((medicine) => ({
    medicine,
    schedule: schedules.find((item) => item.medicineId === medicine.id),
  }))
  const routineGroups = [
    { label: 'On a schedule', entries: routines.filter(({ schedule }) => schedule) },
    { label: 'No schedule', entries: routines.filter(({ schedule }) => !schedule) },
  ]

  return routineGroups.map(
    ({ label, entries }) =>
      entries.length > 0 && (
        <section key={label} aria-label={label} className="flex flex-col gap-2.5">
          <h3 className="px-1 pt-1 text-label leading-none font-extrabold tracking-eyebrow text-muted-foreground uppercase">
            {label}
          </h3>
          <ul className="flex flex-col gap-2.5">
            {entries.map(({ medicine, schedule }) => (
              <Item
                key={medicine.id}
                render={<li />}
                variant={schedule ? 'card' : 'dashed'}
                className="p-3.5 [&>svg]:size-5 has-[[data-row-link]:active]:scale-[0.98] has-[[data-row-link]:active]:bg-muted motion-reduce:has-[[data-row-link]:active]:scale-100"
              >
                <MedicationTile medicineId={medicine.id} />
                <ItemContent className="gap-0.75">
                  <ItemTitle>
                    <h4>{medicine.label}</h4>
                  </ItemTitle>
                  <ItemDescription>
                    {[medicine.strength, medicine.unit].filter(Boolean).join(' · ')}
                  </ItemDescription>
                  {schedule ? (
                    <p className="text-label font-bold">{routineSummary(schedule)}</p>
                  ) : (
                    <p className="text-label font-semibold text-muted-foreground">
                      No schedule yet.
                    </p>
                  )}
                  {!schedule && (
                    <MedicationsLink
                      href={medicationSetupHref(medicine.id)}
                      aria-label={`Set schedule for ${medicine.label}`}
                      className={buttonVariants({
                        variant: 'soft',
                        size: 'sm',
                        className: 'relative z-1 mt-1.5 self-start',
                      })}
                    >
                      Set schedule
                    </MedicationsLink>
                  )}
                </ItemContent>
                <ChevronRightIcon aria-hidden="true" className="text-muted-foreground" />
                <MedicationsLink
                  ref={medicine.id === focusMedicineId ? focusRow : undefined}
                  data-row-link
                  className="absolute inset-0 rounded-[inherit] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                  href={medicationsHref({ mode: 'detail', medicineId: medicine.id })}
                  aria-label={`View details for ${medicine.label}`}
                >
                  <span className="sr-only">View details</span>
                </MedicationsLink>
              </Item>
            ))}
          </ul>
        </section>
      ),
  )
}
