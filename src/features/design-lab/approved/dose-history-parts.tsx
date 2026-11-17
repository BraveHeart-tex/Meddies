'use client'

import { Archive, CalendarDays, Clock, History, Pencil } from 'lucide-react'
import { Fragment, useEffect, useRef, type ReactNode } from 'react'
import { AppShell } from '@/components/layout/app-shell'
import { ScreenStack } from '@/components/layout/screen-stack'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Item, ItemContent, ItemDescription, ItemGroup, ItemTitle } from '@/components/ui/item'
import type { DoseHistoryDose, DoseHistoryTotal } from '@/features/dose-history/contract'
import { MedicationBackRow, MedicationIdentity } from '@/features/medicines/medication-sub-screen'
import { MedicationsLink } from '@/features/medicines/medications-nav'
import { medicationRecordHref } from '@/features/medicines/routes'
import { ClockScheduleCard } from '@/features/schedules/clock-schedule-card'
import { ScheduleActions } from '@/features/schedules/schedule-actions'
import { SchedulingClockProvider } from '@/features/schedules/scheduling-clock'
import { LogDose } from '@/features/unscheduled-doses/log-dose'
import { formatShortDay, formatTime, istanbulDate } from '@/lib/calendar-date'
import { isMedicineType, quantityLabel } from '@/lib/quantity-policy'
import { FixtureQuery } from '../fixture-query'
import { NOW, routine, TODAY } from '../lab-fixtures'
import { ibuprofen, ibuprofenSchedule } from './dose-history-model'

const iconClass = 'size-5 shrink-0 text-muted-foreground'
/** The route is #388's choice; Strength history's `record` view is the pattern. */
export const doseHistoryHref = `/medications?medicine=${ibuprofen.id}&record=doses`

/** Medication detail's providers, with Ibuprofen and its schedule added to the routine. */
export function Frame({ children }: { children: ReactNode }) {
  return (
    <FixtureQuery
      {...routine}
      medicines={[ibuprofen, ...routine.medicines]}
      snapshot={{
        ...routine.snapshot,
        schedules: [...routine.snapshot.schedules, ibuprofenSchedule],
      }}
    >
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
export function InView({
  children,
  block = 'end',
}: {
  children: ReactNode
  block?: 'start' | 'end'
}) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    // jsdom has no scrollIntoView.
    ref.current?.scrollIntoView?.({ block })
  }, [block])
  return (
    <div ref={ref} className="scroll-mt-4 scroll-mb-28">
      {children}
    </div>
  )
}

const unitOf = (unit: string) => (isMedicineType(unit) ? unit : 'tablet')

/** '1 tablet', or split by strength: '2 tablets (200 mg) · 1 tablet (400 mg)'. A part wraps whole, keeping its dot. */
export function Totals({ totals }: { totals: readonly DoseHistoryTotal[] }) {
  if (totals.length === 1) return quantityLabel(totals[0].quantity, unitOf(totals[0].unit))
  return totals.map(({ quantity, unit, strength }, index) => (
    <Fragment key={strength}>
      {index > 0 && ' '}
      <span className="inline-block">
        {quantityLabel(quantity, unitOf(unit))} ({strength ?? 'No strength entered'})
        {index < totals.length - 1 && ' ·'}
      </span>
    </Fragment>
  ))
}

/** A dose's amount; on a day with several strengths, its strength too. */
export function doseFacts(dose: DoseHistoryDose, split = false) {
  return [quantityLabel(dose.quantity, unitOf(dose.unit)), split && dose.strength]
    .filter(Boolean)
    .join(' · ')
}

export const amountText = (dose: DoseHistoryDose) => quantityLabel(dose.quantity, unitOf(dose.unit))

/** A scheduled dose taken on another day names the History date it opens: '20:00 dose on Sat 7 Nov'. */
export function historyNote(dose: DoseHistoryDose) {
  if (dose.kind !== 'scheduled' || istanbulDate(new Date(dose.takenAt)) === dose.historyDate)
    return null
  return `${formatTime(dose.dueAt)} dose on ${formatShortDay(dose.historyDate, TODAY)}`
}

/** '08:10', or 'Sun 8 Nov · 20:15' before today. */
export function lastDoseWhen(dose: DoseHistoryDose) {
  const day = istanbulDate(new Date(dose.takenAt))
  const time = formatTime(dose.takenAt)
  return day === TODAY ? time : `${formatShortDay(day, TODAY)} · ${time}`
}

/** Back to the medication, its identity, then the screen heading and, with doses, how to change one. */
export function DoseHistoryHeader({ note = true }: { note?: boolean }) {
  return (
    <>
      <MedicationBackRow href={medicationRecordHref(ibuprofen.id)}>
        {ibuprofen.label}
      </MedicationBackRow>
      <MedicationIdentity medicine={ibuprofen} />
      <div className="flex flex-col gap-2">
        <h2 className="text-heading">Dose history</h2>
        {note && (
          <p className="text-body-sm text-muted-foreground">
            Doses taken, by the day you took them. Open one to change it in History.
          </p>
        )}
      </div>
    </>
  )
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

/** Medication detail (238·A3) with the Dose history row directly above Strength history. */
export function DoseHistoryDetailScreen() {
  return (
    <Frame>
      <MedicationBackRow href="/medications">Medications</MedicationBackRow>
      <MedicationIdentity medicine={ibuprofen} />
      <section aria-label="Schedule" className="flex flex-col gap-3">
        <ClockScheduleCard schedule={ibuprofenSchedule} unit={ibuprofen.unit} today={TODAY} />
        <ScheduleActions
          medicine={ibuprofen}
          schedule={ibuprofenSchedule}
          ended={false}
          paused={false}
        />
      </section>
      <LogDose medicine={ibuprofen} />
      <InView>
        <section className="flex flex-col gap-3" aria-label="Medication details">
          <h2 className="text-heading">Medication details</h2>
          <ItemGroup>
            <RowLink
              label="Edit details"
              href={medicationRecordHref(ibuprofen.id, 'fix', ibuprofen.currentStrengthRevisionId)}
              description="Updates doses logged at the current strength."
              icon={<Pencil aria-hidden="true" className={iconClass} />}
            />
          </ItemGroup>
          <ItemGroup>
            <RowLink
              label="Change strength"
              href={medicationRecordHref(ibuprofen.id, 'strength')}
              description="Earlier doses keep their saved strength."
              icon={<Clock aria-hidden="true" className={iconClass} />}
            />
            <RowLink
              label="Dose history"
              href={doseHistoryHref}
              icon={<CalendarDays aria-hidden="true" className={iconClass} />}
            />
            <RowLink
              label="Strength history"
              href={medicationRecordHref(ibuprofen.id, 'history')}
              icon={<History aria-hidden="true" className={iconClass} />}
            />
          </ItemGroup>
        </section>
      </InView>
      <Button variant="ghost" size="lg">
        <Archive data-icon="inline-start" />
        Archive medication
      </Button>
    </Frame>
  )
}

/** No Taken dose yet: no summary, and Log a dose is the one primary action. */
export function DoseHistoryEmptyScreen() {
  return (
    <Frame>
      <DoseHistoryHeader note={false} />
      <EmptyState
        icon={CalendarDays}
        title="No doses taken yet"
        body="Doses you log as taken show here, with how much you took."
        action={<LogDose medicine={ibuprofen} primary />}
      />
    </Frame>
  )
}
