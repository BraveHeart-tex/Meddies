'use client'

import { Archive, Clock, History, Pencil } from 'lucide-react'
import { useEffect, useRef, type ReactNode } from 'react'
import { AppShell } from '@/components/layout/app-shell'
import { ScreenStack } from '@/components/layout/screen-stack'
import { Badge } from '@/components/ui/badge'
import { Button, buttonVariants } from '@/components/ui/button'
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemFooter,
  ItemGroup,
  ItemTitle,
} from '@/components/ui/item'
import { MedicationBackRow, MedicationIdentity } from '@/features/medicines/medication-sub-screen'
import { MedicationsLink } from '@/features/medicines/medications-nav'
import { medicationRecordHref } from '@/features/medicines/routes'
import { strengthPeriodDescription } from '@/features/medicines/strength-period'
import { ClockScheduleCard } from '@/features/schedules/clock-schedule-card'
import { ScheduleActions } from '@/features/schedules/schedule-actions'
import { SchedulingClockProvider } from '@/features/schedules/scheduling-clock'
import { LogDose } from '@/features/unscheduled-doses/log-dose'
import { FixtureQuery } from '../fixture-query'
import { amoxicillinSchedule, NOW, routine, TODAY } from '../lab-fixtures'
import { amoxicillinRecord } from './edit-details-model'

const noop = () => {}
const medicine = amoxicillinRecord
const periods = medicine.strengthRevisions ?? []
const iconClass = 'size-5 shrink-0 text-muted-foreground'

function Frame({ children }: { children: ReactNode }) {
  return (
    <FixtureQuery {...routine} medicines={[medicine, ...routine.medicines.slice(0, 2)]}>
      <SchedulingClockProvider serverNow={NOW}>
        <AppShell current="/medications">
          <ScreenStack>
            <div className="flex flex-col gap-5 [overflow-wrap:anywhere]">{children}</div>
          </ScreenStack>
        </AppShell>
      </SchedulingClockProvider>
    </FixtureQuery>
  )
}

/** Scrolls the reviewed section into view so the 402x874 capture shows it. */
function InView({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    // jsdom has no scrollIntoView.
    ref.current?.scrollIntoView?.({ block: 'end' })
  }, [])
  return <div ref={ref}>{children}</div>
}

function RowLink({
  label,
  href,
  description,
  icon,
}: {
  label: string
  href: string
  description?: string
  icon: ReactNode
}) {
  return (
    <Item variant="card" render={<MedicationsLink aria-label={label} href={href} />}>
      <ItemContent>
        <ItemTitle>{label}</ItemTitle>
        {description && <ItemDescription>{description}</ItemDescription>}
      </ItemContent>
      {icon}
    </Item>
  )
}

const editHref = medicationRecordHref(medicine.id, 'fix', medicine.currentStrengthRevisionId)
const strengthHref = medicationRecordHref(medicine.id, 'strength')
const historyHref = medicationRecordHref(medicine.id, 'history')

/** Edit details alone with its effect, then the strength rows together. */
function DetailsSection() {
  return (
    <section className="flex flex-col gap-3" aria-label="Medication details">
      <h2 className="text-heading">Medication details</h2>
      <ItemGroup>
        <RowLink
          label="Edit details"
          href={editHref}
          description="Updates doses logged at the current strength."
          icon={<Pencil aria-hidden="true" className={iconClass} />}
        />
      </ItemGroup>
      <ItemGroup>
        <RowLink
          label="Change strength"
          href={strengthHref}
          description="Earlier doses keep their saved strength."
          icon={<Clock aria-hidden="true" className={iconClass} />}
        />
        <RowLink
          label="Strength history"
          href={historyHref}
          icon={<History aria-hidden="true" className={iconClass} />}
        />
      </ItemGroup>
    </section>
  )
}

/** Medication detail (238·A3) with the 346·C1 Medication details section. */
export function EditDetailsDetailScreen() {
  return (
    <Frame>
      <MedicationBackRow href="/medications">Medications</MedicationBackRow>
      <MedicationIdentity medicine={medicine} />
      <section aria-label="Schedule" className="flex flex-col gap-3">
        <ClockScheduleCard schedule={amoxicillinSchedule} unit={medicine.unit} today={TODAY} />
        <ScheduleActions
          medicine={medicine}
          schedule={amoxicillinSchedule}
          ended={false}
          paused={false}
          onStopped={noop}
          onPaused={noop}
          onResumed={noop}
        />
      </section>
      <LogDose medicine={medicine} />
      <InView>
        <DetailsSection />
      </InView>
      <Button variant="ghost" size="lg">
        <Archive data-icon="inline-start" />
        Archive medication
      </Button>
    </Frame>
  )
}

/** A period: its strength with a Current badge, its dates, then the edit for this period. */
function PeriodCard({ id }: { id: string }) {
  const period = periods.find((row) => row.id === id)!
  return (
    <Item variant="card">
      <ItemContent>
        <div className="flex flex-wrap items-center gap-2">
          <ItemTitle>{period.strength ?? 'No strength entered'}</ItemTitle>
          {id === medicine.currentStrengthRevisionId && <Badge variant="secondary">Current</Badge>}
        </div>
        <ItemDescription>{strengthPeriodDescription(periods, id, TODAY)}</ItemDescription>
      </ItemContent>
      <ItemFooter>
        <MedicationsLink
          href={medicationRecordHref(medicine.id, 'fix', id)}
          className={buttonVariants({ variant: 'outline', className: 'w-full' })}
        >
          <Pencil data-icon="inline-start" aria-hidden="true" />
          Edit details for this period
        </MedicationsLink>
      </ItemFooter>
    </Item>
  )
}

/** Strength history (346·C2): the note first, then two periods, newest first. */
export function EditDetailsHistoryScreen() {
  return (
    <Frame>
      <MedicationBackRow href={medicationRecordHref(medicine.id)}>
        {medicine.label}
      </MedicationBackRow>
      <MedicationIdentity medicine={medicine} />
      <h2 className="text-heading">Strength history</h2>
      <p className="text-body-sm text-muted-foreground">
        Editing a period updates the doses logged in it. Changing strength starts a new period.
      </p>
      <ItemGroup>
        {[...periods].reverse().map((period) => (
          <PeriodCard key={period.id} id={period.id} />
        ))}
      </ItemGroup>
    </Frame>
  )
}
