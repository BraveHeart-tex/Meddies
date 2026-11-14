'use client'

import { useEffect, useRef } from 'react'
import type { Medicine } from '@/features/medicines/contract'
import { formatShortDay } from '@/lib/calendar-date'
import { istanbulDate, type DailySchedule } from './contract'
import { intervalRowSummary } from './interval-dose-list'
import { intervalAnchor, intervalLabel, nextIntervalDoses } from './interval-preview'
import { pausedSinceLine } from './clock-schedule-card'
import { endedOn, pausedOn, untilLastDay } from './last-day'
import { MedicationRow } from './medication-row'
import { useScheduleNow } from './use-schedule-now'
import { ALL_WEEKDAYS, weekdaySummary } from './weekdays'

/** A Medications row's schedule line; a paused one stays in On a schedule (233·A6). */
export function routineSummary(schedule: DailySchedule, now: string) {
  const today = istanbulDate(new Date(now))
  const ended = endedOn(schedule, today)
  if (ended) return `Ended ${formatShortDay(ended, today)}`
  const paused = pausedOn(schedule, today)
  if (paused) return pausedSinceLine(paused, today)
  const hours = schedule.intervalHours
  if (hours != null) {
    const anchor = intervalAnchor(schedule)
    const next = nextIntervalDoses({ anchor, hours, now, count: 1 })
    // No next dose after the Last day (227·A20).
    const [due] = untilLastDay(next, schedule.endDate ?? null)
    return due ? intervalRowSummary(hours, due, today) : intervalLabel(hours)
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
  /** The row to focus once, when the list shows after Done for now. */
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
  const today = istanbulDate(new Date(now))
  const isEnded = (schedule: DailySchedule) => Boolean(endedOn(schedule, today))
  // Ended schedules sit below the others (227·A20).
  const routineGroups = [
    {
      label: 'On a schedule',
      entries: routines.filter(({ schedule }) => schedule && !isEnded(schedule)),
    },
    { label: 'No schedule', entries: routines.filter(({ schedule }) => !schedule) },
    {
      label: 'Ended',
      entries: routines.filter(({ schedule }) => schedule && isEnded(schedule)),
    },
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
                paused={Boolean(schedule && pausedOn(schedule, today))}
                linkRef={medicine.id === focusMedicineId ? focusRow : undefined}
              />
            ))}
          </ul>
        </section>
      ),
  )
}
