'use client'

import { AppHeader } from '@/components/layout/app-header'
import { AppShell } from '@/components/layout/app-shell'
import type { Medicine } from '@/features/medicines/contract'
import { MedicationBackRow, MedicationIdentity } from '@/features/medicines/medication-sub-screen'
import { medicationsHref } from '@/features/medicines/routes'
import { intervalRowSummary } from '@/features/schedules/interval-dose-list'
import { nextIntervalDoses } from '@/features/schedules/interval-preview'
import { IntervalScheduleCard } from '@/features/schedules/interval-schedule-card'
import { MedicationRow } from '@/features/schedules/medication-row'
import { magnesium, NOW, TODAY } from './interval-lab-model'

const fixtures: { medicine: Medicine; hours: number; anchor: string }[] = [
  { medicine: magnesium, hours: 8, anchor: '2026-11-09T05:00:00.000Z' },
  {
    medicine: { ...magnesium, id: '22222222-2222-4222-8222-222222222222', label: 'Iron' },
    hours: 7,
    anchor: '2026-11-03T19:00:00.000Z',
  },
  {
    medicine: { ...magnesium, id: '33333333-3333-4333-8333-333333333333', label: 'Zinc' },
    hours: 24,
    anchor: '2026-11-10T06:00:00.000Z',
  },
]

const vitaminD: Medicine = {
  ...magnesium,
  id: '44444444-4444-4444-8444-444444444444',
  label: 'Vitamin D',
  strength: null,
}

/** Interval rows beside a Clock schedule row, whose summary is unchanged. */
export function IntervalListFrame() {
  return (
    <AppShell>
      <div className="flex flex-col gap-5">
        <AppHeader title="Medications" />
        <section aria-label="On a schedule" className="flex flex-col gap-2.5">
          <h3 className="px-1 pt-1 text-label leading-none font-extrabold tracking-eyebrow text-muted-foreground uppercase">
            On a schedule
          </h3>
          <ul className="flex flex-col gap-2.5">
            {fixtures.map(({ medicine, hours, anchor }) => (
              <MedicationRow
                key={medicine.id}
                medicine={medicine}
                scheduleSummary={intervalRowSummary(
                  hours,
                  nextIntervalDoses({ anchor, hours, now: NOW, count: 1 })[0],
                  TODAY,
                )}
              />
            ))}
            <MedicationRow medicine={vitaminD} scheduleSummary="Every day · 08:00, 20:00" />
          </ul>
        </section>
      </div>
    </AppShell>
  )
}

export function IntervalDetailFrame({ hours, anchor }: { hours: number; anchor: string }) {
  return (
    <AppShell>
      <div className="flex flex-col gap-5 [overflow-wrap:anywhere]">
        <MedicationBackRow href={medicationsHref({ mode: 'list' })}>Medications</MedicationBackRow>
        <MedicationIdentity medicine={magnesium} />
        <section aria-labelledby="routine-heading" className="flex flex-col gap-3">
          <h2 id="routine-heading" className="sr-only">
            Schedule
          </h2>
          <IntervalScheduleCard
            hours={hours}
            anchor={anchor}
            quantity={1}
            unit={magnesium.unit}
            now={NOW}
          />
        </section>
        <p className="text-label text-muted-foreground">
          Details and schedules can&apos;t be changed here yet.
        </p>
      </div>
    </AppShell>
  )
}
