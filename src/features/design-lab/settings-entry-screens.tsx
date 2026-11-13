'use client'

import { Calendar, Clock, Hourglass, Plus, ShieldCheck, UserRound } from 'lucide-react'
import Link from 'next/link'
import { SettingsGroup, SettingsRow } from '@/app/settings/settings-list'
import { Button, buttonVariants } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { LoadingSection } from '@/components/ui/skeleton'
import type { Medicine } from '@/features/medicines/contract'
import { MedicationIdentity } from '@/features/medicines/medication-sub-screen'
import { ClockScheduleCard } from '@/features/schedules/clock-schedule-card'
import type { DoseOccurrence } from '@/features/schedules/contract'
import { HistoryDateNav } from '@/features/schedules/history-date-nav'
import { MedicationRow } from '@/features/schedules/medication-row'
import { NextDose } from '@/features/schedules/next-dose'
import { TodaySkeleton } from '@/features/schedules/today-skeleton'
import { formatLongDay } from '@/lib/calendar-date'
import { magnesium, NOW, TODAY } from './lab-fixtures'
import { clockRunning } from './pause-model'
import { BackRow, EntryHeader, EntryHeaderSkeleton, EntryShell } from './settings-entry-shell'

const iron: Medicine = { ...magnesium, id: '22222222-2222-4222-8222-222222222222', label: 'Iron' }
const vitaminD: Medicine = {
  ...magnesium,
  id: '44444444-4444-4444-8444-444444444444',
  label: 'Vitamin D',
  strength: null,
}

const evening: DoseOccurrence = {
  id: 'dose-mg-2000',
  scheduleId: clockRunning.id,
  medicineId: magnesium.id,
  dueAt: '2026-11-09T17:00:00.000Z',
  quantity: 1,
  status: 'Upcoming',
}

export function TodayScreen() {
  return (
    <EntryShell page="today">
      <div className="flex flex-col gap-5">
        <EntryHeader eyebrow={formatLongDay(NOW, NOW)} title="Good morning" />
        <NextDose
          dose={evening}
          date={TODAY}
          medicine={magnesium}
          name={magnesium.label}
          doseText="1 tablet"
        />
      </div>
    </EntryShell>
  )
}

export function MedicationsScreen() {
  return (
    <EntryShell page="medications">
      <div className="flex flex-col gap-5">
        <EntryHeader
          title="Medications"
          subtitle="3 medications"
          action={
            <Link
              href="/medications?add"
              aria-label="Add a medication"
              className={buttonVariants({ className: 'rounded-full' })}
            >
              <Plus aria-hidden="true" data-icon="inline-start" />
              Add
            </Link>
          }
        />
        <section aria-label="On a schedule" className="flex flex-col gap-2.5">
          <h3 className="px-1 pt-1 text-label leading-none font-extrabold tracking-eyebrow text-muted-foreground uppercase">
            On a schedule
          </h3>
          <ul className="flex flex-col gap-2.5">
            <MedicationRow medicine={magnesium} scheduleSummary="Every day · 08:00, 20:00" />
            <MedicationRow medicine={iron} scheduleSummary="Every day · 22:00" />
          </ul>
        </section>
        <section aria-label="No schedule" className="flex flex-col gap-2.5">
          <h3 className="px-1 pt-1 text-label leading-none font-extrabold tracking-eyebrow text-muted-foreground uppercase">
            No schedule
          </h3>
          <ul className="flex flex-col gap-2.5">
            <MedicationRow medicine={vitaminD} scheduleSummary={null} />
          </ul>
        </section>
      </div>
    </EntryShell>
  )
}

export function DetailScreen() {
  return (
    <EntryShell page="medications">
      <div className="flex flex-col gap-5">
        <BackRow href="/medications">Medications</BackRow>
        <MedicationIdentity medicine={magnesium} />
        <ClockScheduleCard schedule={clockRunning} unit={magnesium.unit} today={TODAY} />
      </div>
    </EntryShell>
  )
}

export function HistoryScreen() {
  return (
    <EntryShell page="history">
      <div className="flex flex-col gap-5">
        <EntryHeader title="History" />
        <HistoryDateNav today={TODAY} />
        <EmptyState
          icon={Calendar}
          title="Nothing due yet today"
          body="Doses will show here once they're due."
          titleAs="h2"
        />
      </div>
    </EntryShell>
  )
}

export function SettingsScreen() {
  return (
    <EntryShell page="settings">
      <section className="space-y-5">
        <EntryHeader title="Settings" />
        <SettingsGroup title="Account">
          <SettingsRow icon={UserRound} label="Google account">
            <span className="inline-flex items-center gap-1 text-dose-taken-foreground [&>svg]:size-4">
              <ShieldCheck aria-hidden="true" />
              Approved
            </span>
          </SettingsRow>
          <SettingsRow icon={Hourglass} label="Session ends">
            Mon 16 Nov at 10:00
          </SettingsRow>
        </SettingsGroup>
        <SettingsGroup title="Time" note="The same wherever your device is.">
          <SettingsRow icon={Clock} label="Times">
            Istanbul, 24-hour
          </SettingsRow>
        </SettingsGroup>
        <div className="space-y-1">
          <Button type="button" variant="outline" size="lg" className="w-full">
            Sign out
          </Button>
          <p className="text-caption text-muted-foreground">
            Signs you out of Meddies in this browser. Your Google account and Meddies sessions on
            other devices stay signed in.
          </p>
        </div>
      </section>
    </EntryShell>
  )
}

export function LaunchScreen() {
  return (
    <EntryShell page={null}>
      <LoadingSection label="Opening Meddies" className="flex flex-col gap-5">
        <EntryHeaderSkeleton />
        <TodaySkeleton />
      </LoadingSection>
    </EntryShell>
  )
}
