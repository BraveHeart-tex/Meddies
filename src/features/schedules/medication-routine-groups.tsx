'use client'

import { useEffect, useRef } from 'react'
import type { Medicine } from '@/features/medicines/contract'
import { istanbulDate, type DailySchedule } from './contract'
import { intervalRowSummary } from './interval-dose-list'
import { intervalAnchor, nextIntervalDoses } from './interval-preview'
import { MedicationRow } from './medication-row'
import { useScheduleNow } from './use-schedule-now'
import { ALL_WEEKDAYS, weekdaySummary } from './weekdays'

function routineSummary(schedule: DailySchedule, now: string) {
  const hours = schedule.intervalHours
  if (hours != null) {
    const anchor = intervalAnchor(schedule)
    const [next] = nextIntervalDoses({ anchor, hours, now, count: 1 })
    return intervalRowSummary(hours, next, istanbulDate(new Date(now)))
  }
  return [
    weekdaySummary(schedule.weekdays ?? ALL_WEEKDAYS, 'short'),
    schedule.times.map((slot) => slot.time).join(', '),
  ].join(' · ')
}

export function MedicationRoutineGroups({
  medicines,
  schedules,
  serverNow,
  focusMedicineId,
  onMedicineFocused,
}: {
  medicines: Medicine[]
  schedules: DailySchedule[]
  serverNow: string
  /** The row to focus once, when the list shows after Done for now (647·B1). */
  focusMedicineId?: string | null
  onMedicineFocused?: () => void
}) {
  const now = useScheduleNow(serverNow)
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
              <MedicationRow
                key={medicine.id}
                medicine={medicine}
                scheduleSummary={schedule ? routineSummary(schedule, now) : null}
                linkRef={medicine.id === focusMedicineId ? focusRow : undefined}
              />
            ))}
          </ul>
        </section>
      ),
  )
}
