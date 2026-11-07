import Link from 'next/link'
import { MedicationTile } from '@/features/medicines/medication-tile'
import { buttonVariants } from '@/components/ui/button'
import { Item, ItemActions, ItemContent, ItemDescription, ItemTitle } from '@/components/ui/item'
import type { Medicine } from '@/features/medicines/contract'
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
}: {
  medicines: Medicine[]
  schedules: DailySchedule[]
}) {
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
                className="p-3.5 has-[[data-row-link]:active]:scale-[0.98] has-[[data-row-link]:active]:bg-muted motion-reduce:has-[[data-row-link]:active]:scale-100"
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
                      No schedule saved yet.
                    </p>
                  )}
                </ItemContent>
                <Link
                  data-row-link
                  className="absolute inset-0 rounded-[inherit] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                  href={`/medications?medicine=${encodeURIComponent(medicine.id)}`}
                  aria-label={`View details for ${medicine.label}`}
                >
                  <span className="sr-only">View details</span>
                </Link>
                {!schedule && (
                  <ItemActions className="relative">
                    <Link
                      href={`/medications?schedule=${encodeURIComponent(medicine.id)}#schedule-heading`}
                      aria-label={`Add schedule for ${medicine.label}`}
                      className={buttonVariants({ variant: 'soft', size: 'sm' })}
                    >
                      Add schedule
                    </Link>
                  </ItemActions>
                )}
              </Item>
            ))}
          </ul>
        </section>
      ),
  )
}
