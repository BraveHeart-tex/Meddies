'use client'

import { AppHeader } from '@/components/layout/app-header'
import { AppShell } from '@/components/layout/app-shell'
import type { Medicine } from '@/features/medicines/contract'
import { intervalRowSummary } from '@/features/schedules/interval-dose-list'
import { intervalAnchor, nextIntervalDoses } from '@/features/schedules/interval-preview'
import { endedOn } from '@/features/schedules/last-day'
import { MedicationRow } from '@/features/schedules/medication-row'
import { routineSummary } from '@/features/schedules/medication-routine-groups'
import { weekdaySummary } from '@/features/schedules/weekdays'
import { formatShortDay } from '@/lib/calendar-date'
import { magnesium, NOW, TODAY } from './lab-fixtures'
import { ENDED_ON } from './last-day-model'
import { clockPaused, clockRunning, intervalRunning, type PausableSchedule } from './pause-model'

const iron: Medicine = { ...magnesium, id: '22222222-2222-4222-8222-222222222222', label: 'Iron' }
const zinc: Medicine = { ...magnesium, id: '33333333-3333-4333-8333-333333333333', label: 'Zinc' }
const vitaminD: Medicine = {
  ...magnesium,
  id: '44444444-4444-4444-8444-444444444444',
  label: 'Vitamin D',
  strength: null,
}
const omega: Medicine = {
  ...magnesium,
  id: '55555555-5555-4555-8555-555555555555',
  label: 'Omega 3',
  unit: 'capsule',
}

const clockLine = (schedule: PausableSchedule) =>
  [
    weekdaySummary(schedule.weekdays, 'short'),
    schedule.times.map((slot) => slot.time).join(', '),
  ].join(' · ')

const ironSchedule: PausableSchedule = {
  ...intervalRunning,
  medicineId: iron.id,
  startDate: '2026-11-03',
  times: [{ time: '22:00', quantity: 1 }],
  intervalHours: 7,
  endDate: null,
}
const ironNext = nextIntervalDoses({
  anchor: intervalAnchor(ironSchedule),
  hours: 7,
  now: NOW,
  count: 1,
})[0]

/** Zinc was paused on Sun 1 Nov and its Last day passed, so it is an Ended schedule (227·A17). */
const zincEnded = endedOn({ endDate: ENDED_ON, stoppedAt: null }, TODAY)!

/**
 * Medications with Magnesium paused (233·A6): it stays in On a schedule and reads "Paused since".
 * Zinc's Last day passed while paused, so it sits in Ended (227·A20).
 */
export function PausedListFrame() {
  const groups = [
    {
      label: 'On a schedule',
      entries: [
        { medicine: magnesium, summary: routineSummary(clockPaused, NOW) },
        { medicine: iron, summary: intervalRowSummary(7, ironNext, TODAY) },
        { medicine: omega, summary: clockLine({ ...clockRunning, endDate: null }) },
      ],
    },
    { label: 'No schedule', entries: [{ medicine: vitaminD, summary: null }] },
    {
      label: 'Ended',
      entries: [{ medicine: zinc, summary: `Ended ${formatShortDay(zincEnded, TODAY)}` }],
    },
  ]
  return (
    <AppShell>
      <div className="flex flex-col gap-5">
        <AppHeader title="Medications" />
        {groups.map(
          ({ label, entries }) =>
            entries.length > 0 && (
              <section key={label} aria-label={label} className="flex flex-col gap-2.5">
                <h3 className="px-1 pt-1 text-label leading-none font-extrabold tracking-eyebrow text-muted-foreground uppercase">
                  {label}
                </h3>
                <ul className="flex flex-col gap-2.5">
                  {entries.map(({ medicine, summary }) => (
                    <MedicationRow
                      key={medicine.id}
                      medicine={medicine}
                      scheduleSummary={summary}
                    />
                  ))}
                </ul>
              </section>
            ),
        )}
      </div>
    </AppShell>
  )
}
