import { Calendar, Hourglass, Plus, ShieldCheck, UserRound } from 'lucide-react'
import Link from 'next/link'
import type { ReactNode } from 'react'
import Loading from '@/app/loading'
import { SettingsFrame } from '@/app/settings/settings-frame'
import { SettingsRow } from '@/app/settings/settings-list'
import { AppHeader } from '@/components/layout/app-header'
import { AppShell } from '@/components/layout/app-shell'
import { Button, buttonVariants } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import type { Medicine } from '@/features/medicines/contract'
import { MedicationBackRow, MedicationIdentity } from '@/features/medicines/medication-sub-screen'
import { medicationsHref } from '@/features/medicines/routes'
import { ClockScheduleCard } from '@/features/schedules/clock-schedule-card'
import type { DoseOccurrence } from '@/features/schedules/contract'
import { HistoryDateNav } from '@/features/schedules/history-date-nav'
import { MedicationRow } from '@/features/schedules/medication-row'
import { NextDose } from '@/features/schedules/next-dose'
import { formatLongDay } from '@/lib/calendar-date'
import type { DesignFrame } from './frames'
import { magnesium, NOW, TODAY } from './lab-fixtures'
import { clockRunning } from './pause-model'

/**
 * #238, Direction A approved and built in #239: Settings is the fourth tab and headers carry only
 * page actions. A1-A6 are Today, Medications, Medication detail, History, Settings and the cold
 * launch, composed from the production AppShell and AppHeader. The lab URL selects no tab, so each
 * frame names its own.
 */
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

function Screen({ current, children }: { current: string; children: ReactNode }) {
  return (
    <AppShell current={current}>
      <div className="flex flex-col gap-5">{children}</div>
    </AppShell>
  )
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section aria-label={title} className="flex flex-col gap-2.5">
      <h3 className="px-1 pt-1 text-label leading-none font-extrabold tracking-eyebrow text-muted-foreground uppercase">
        {title}
      </h3>
      <ul className="flex flex-col gap-2.5">{children}</ul>
    </section>
  )
}

function TodayScreen() {
  return (
    <Screen current="/">
      <AppHeader eyebrow={formatLongDay(NOW, NOW)} title="Good morning" />
      <NextDose
        dose={evening}
        date={TODAY}
        medicine={magnesium}
        name={magnesium.label}
        doseText="1 tablet"
      />
    </Screen>
  )
}

function MedicationsScreen() {
  return (
    <Screen current="/medications">
      <AppHeader
        title="Medications"
        subtitle="3 medications"
        action={
          <Link
            href={medicationsHref({ mode: 'add' })}
            aria-label="Add a medication"
            className={buttonVariants({ className: 'rounded-full' })}
          >
            <Plus aria-hidden="true" data-icon="inline-start" />
            Add
          </Link>
        }
      />
      <Group title="On a schedule">
        <MedicationRow medicine={magnesium} scheduleSummary="Every day · 08:00, 20:00" />
        <MedicationRow medicine={iron} scheduleSummary="Every day · 22:00" />
      </Group>
      <Group title="No schedule">
        <MedicationRow medicine={vitaminD} scheduleSummary={null} />
      </Group>
    </Screen>
  )
}

function DetailScreen() {
  return (
    <Screen current="/medications">
      <MedicationBackRow href={medicationsHref({ mode: 'list' })}>Medications</MedicationBackRow>
      <MedicationIdentity medicine={magnesium} />
      <ClockScheduleCard schedule={clockRunning} unit={magnesium.unit} today={TODAY} />
    </Screen>
  )
}

function HistoryScreen() {
  return (
    <Screen current="/history">
      <AppHeader title="History" />
      <HistoryDateNav today={TODAY} />
      <EmptyState
        icon={Calendar}
        title="Nothing due yet today"
        body="Doses will show here once they're due."
        titleAs="h2"
      />
    </Screen>
  )
}

function SettingsScreen() {
  return (
    <SettingsFrame
      account={
        <>
          <SettingsRow icon={UserRound} label="Google account">
            <span className="inline-flex items-center gap-1 text-dose-taken-foreground [&>svg]:size-4">
              <ShieldCheck aria-hidden="true" />
              Approved
            </span>
          </SettingsRow>
          <SettingsRow icon={Hourglass} label="Session ends">
            Mon 16 Nov at 10:00
          </SettingsRow>
        </>
      }
    >
      <Button type="button" variant="outline" size="lg" className="w-full">
        Sign out
      </Button>
      <p className="text-caption text-muted-foreground">
        Signs you out of Meddies in this browser. Your Google account and Meddies sessions on other
        devices stay signed in.
      </p>
    </SettingsFrame>
  )
}

const screens: [string, () => ReactNode][] = [
  ['Today', TodayScreen],
  ['Medications', MedicationsScreen],
  ['Medication detail', DetailScreen],
  ['History', HistoryScreen],
  ['Settings', SettingsScreen],
  ['Cold launch', Loading],
]

export const settingsEntryFrames: readonly DesignFrame[] = screens.map(
  ([title, Screen], index): DesignFrame => ({
    slug: `238-a${index + 1}` as DesignFrame['slug'],
    title: `Fourth tab, ${title}`,
    citation: `238·A${index + 1}` as DesignFrame['citation'],
    render: () => <Screen />,
  }),
)
