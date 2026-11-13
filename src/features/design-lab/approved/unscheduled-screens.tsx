'use client'

import type { ReactNode } from 'react'
import Link from 'next/link'
import { ChevronLeft, ChevronRight, Clock } from 'lucide-react'
import { AppHeader } from '@/components/layout/app-header'
import { AppShell } from '@/components/layout/app-shell'
import { Button, buttonVariants } from '@/components/ui/button'
import { DatePicker } from '@/components/ui/date-picker'
import { EmptyState } from '@/components/ui/empty-state'
import { Item, ItemContent, ItemDescription, ItemTitle } from '@/components/ui/item'
import type { Medicine } from '@/features/medicines/contract'
import { MedicationBackRow, MedicationIdentity } from '@/features/medicines/medication-sub-screen'
import { medicationSetupHref, medicationsHref } from '@/features/medicines/routes'
import type { DoseOccurrence } from '@/features/schedules/contract'
import { ClockScheduleCard } from '@/features/schedules/clock-schedule-card'
import { DoseStatusBadge } from '@/features/schedules/dose-status-badge'
import { greeting, NextDose } from '@/features/schedules/next-dose'
import type { UnscheduledDose } from '@/features/unscheduled-doses/contract'
import { formatLongDay, formatTime } from '@/lib/calendar-date'
import { quantityLabel } from '@/lib/dose-quantity'
import { cn } from '@/lib/utils'
import { magnesium, magnesiumSchedule, NOW, TODAY } from '../lab-fixtures'
import { medicines } from './unscheduled-model'
import { badgeClassName, LogDoseEntry, rowClassName } from './unscheduled-parts'

const medicineOf = (id: string) => medicines.find((item) => item.id === id) as Medicine

/**
 * Medication detail with Log a dose under the schedule, with no schedule or a running one
 * (241·A1, A2). No list of past Unscheduled doses.
 */
export function LogDetail({
  medicine,
  logHref,
  children,
}: {
  medicine: Medicine
  logHref: string
  /** The open drawer or the save message. */
  children?: ReactNode
}) {
  const hasSchedule = medicine.id === magnesium.id
  return (
    <AppShell current="/medications">
      <div className="flex flex-col gap-5 [overflow-wrap:anywhere]">
        <MedicationBackRow href={medicationsHref({ mode: 'list' })}>Medications</MedicationBackRow>
        <MedicationIdentity medicine={medicine} />
        <section aria-labelledby="routine-heading" className="flex flex-col gap-3">
          <h2 id="routine-heading" className="sr-only">
            Schedule
          </h2>
          {hasSchedule ? (
            <>
              <ClockScheduleCard schedule={magnesiumSchedule} unit={magnesium.unit} today={TODAY} />
              <div className="grid grid-cols-2 gap-2.5 *:px-3">
                <Link
                  href={medicationSetupHref(magnesium.id)}
                  className={buttonVariants({
                    variant: 'outline',
                    size: 'lg',
                    className: 'col-span-2',
                  })}
                >
                  Change schedule
                </Link>
                <Link
                  href="/lab/241-a2"
                  className={buttonVariants({ variant: 'outline', size: 'lg' })}
                >
                  Pause
                </Link>
                <Link
                  href="/lab/241-a2"
                  className={buttonVariants({ variant: 'destructive', size: 'lg' })}
                >
                  Stop schedule
                </Link>
              </div>
            </>
          ) : (
            <EmptyState
              icon={Clock}
              title="No schedule yet"
              body={<>Today won&apos;t list {medicine.label} until it has a schedule.</>}
              action={
                <Link
                  className={buttonVariants({ size: 'lg' })}
                  href={medicationSetupHref(medicine.id)}
                >
                  Set schedule
                </Link>
              }
            />
          )}
        </section>
        <LogDoseEntry href={logHref} id="log-dose" />
        <p className="text-label text-muted-foreground">Details can&apos;t be changed here yet.</p>
      </div>
      {children}
    </AppShell>
  )
}

type Row =
  | { kind: 'scheduled'; at: string; dose: DoseOccurrence }
  | { kind: 'unscheduled'; at: string; dose: UnscheduledDose }

/** Scheduled doses by due time and Unscheduled doses by taken time, in one order. */
const rowsOf = (scheduled: DoseOccurrence[], unscheduled: UnscheduledDose[]): Row[] =>
  [
    ...scheduled.map((dose) => ({ kind: 'scheduled' as const, at: dose.dueAt, dose })),
    ...unscheduled.map((dose) => ({ kind: 'unscheduled' as const, at: dose.takenAt, dose })),
  ].sort((a, b) => a.at.localeCompare(b.at))

/** Today's and History's scheduled row, static: no drawer in the lab. */
function ScheduledRow({ dose, variant }: { dose: DoseOccurrence; variant: 'today' | 'history' }) {
  const medicine = medicineOf(dose.medicineId)
  const done = dose.status === 'Taken' || dose.status === 'Skipped'
  const takenAt = dose.status === 'Taken' ? dose.record.takenAt : ''
  return (
    <Item
      render={<li />}
      variant={
        dose.status === 'Not logged' ? (variant === 'history' ? 'dashed' : 'attention') : 'card'
      }
      className={rowClassName}
    >
      <span
        aria-hidden="true"
        className={cn('w-11.5 shrink-0 font-extrabold', done && 'text-muted-foreground')}
      >
        <time dateTime={dose.dueAt}>{formatTime(dose.dueAt)}</time>
      </span>
      <ItemContent className="min-w-0 gap-0.75">
        <ItemTitle>
          <span className="sr-only">{formatTime(dose.dueAt)} · </span>
          {medicine.label}
        </ItemTitle>
        <ItemDescription>
          {[medicine.strength, quantityLabel(dose.quantity, medicine.unit)]
            .filter(Boolean)
            .join(' · ')}
        </ItemDescription>
      </ItemContent>
      <DoseStatusBadge
        className={badgeClassName}
        status={dose.status}
        time={takenAt ? <time dateTime={takenAt}>{formatTime(takenAt)}</time> : undefined}
      />
    </Item>
  )
}

/** An Unscheduled dose row: its taken time in the time column, marked in its detail line (241·A5). */
function UnscheduledRow({ dose, href }: { dose: UnscheduledDose; href: string }) {
  const medicine = medicineOf(dose.medicineId)
  const quantity = quantityLabel(dose.quantity, medicine.unit)
  return (
    <Item render={<li />} variant="card" className={rowClassName}>
      <span aria-hidden="true" className="w-11.5 shrink-0 font-extrabold text-muted-foreground">
        <time dateTime={dose.takenAt}>{formatTime(dose.takenAt)}</time>
      </span>
      <ItemContent className="min-w-0 gap-0.75">
        <ItemTitle>
          <span className="sr-only">{formatTime(dose.takenAt)} · </span>
          {medicine.label}
        </ItemTitle>
        <ItemDescription>
          {[medicine.strength, quantity].filter(Boolean).join(' · ')}
          {' · Not on a schedule'}
        </ItemDescription>
      </ItemContent>
      <DoseStatusBadge className={badgeClassName} status="Taken" />
      <Link
        href={href}
        data-row-trigger
        aria-label={`Review dose for ${medicine.label} taken at ${formatTime(dose.takenAt)}, not on a schedule`}
        className="absolute inset-0 rounded-[inherit] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      />
    </Item>
  )
}

function DoseRows({
  rows,
  changeHref,
  variant,
}: {
  rows: Row[]
  changeHref: string
  variant: 'today' | 'history'
}) {
  return rows.map((row) =>
    row.kind === 'scheduled' ? (
      <ScheduledRow key={row.dose.id} dose={row.dose} variant={variant} />
    ) : (
      <UnscheduledRow key={row.dose.id} dose={row.dose} href={changeHref} />
    ),
  )
}

/**
 * Today at 10:00: an Unscheduled dose sits in Logged in time order, never Up next. With only
 * Unscheduled doses, Logged replaces "Nothing to take today".
 */
export function TodayScreen({
  scheduled,
  unscheduled,
  changeHref,
  children,
}: {
  scheduled: DoseOccurrence[]
  unscheduled: UnscheduledDose[]
  changeHref: string
  children?: ReactNode
}) {
  const next = scheduled.find((dose) => dose.status === 'Upcoming')
  const later = scheduled.filter((dose) => dose.status === 'Upcoming')
  const logged = rowsOf(
    scheduled.filter((dose) => dose.status === 'Taken' || dose.status === 'Skipped'),
    unscheduled,
  )
  const groups = [
    { label: 'Later today', rows: rowsOf(later, []) },
    { label: 'Logged', rows: logged },
  ].filter((group) => group.rows.length)
  return (
    <AppShell current="/">
      <div className="flex flex-col gap-5">
        <AppHeader eyebrow={formatLongDay(NOW, TODAY)} title={greeting(NOW)} />
        <section aria-label="Your doses" className="flex flex-col gap-5">
          {next && (
            <NextDose
              dose={next}
              date={TODAY}
              medicine={magnesium}
              name={magnesium.label}
              doseText={quantityLabel(next.quantity, magnesium.unit)}
              onRecord={() => {}}
            />
          )}
          <ul aria-label="Today's doses" className="flex flex-col gap-2.5">
            {groups.flatMap((group) => [
              <li key={group.label} role="presentation" className="px-1 pt-2.5 first:pt-0">
                <h3 className="text-heading font-extrabold">
                  {group.label} · {group.rows.length}
                </h3>
              </li>,
              <DoseRows
                key={`${group.label}-rows`}
                rows={group.rows}
                changeHref={changeHref}
                variant="today"
              />,
            ])}
          </ul>
          <Button variant="ghost" className="self-center">
            Refresh Today
          </Button>
        </section>
      </div>
      {children}
    </AppShell>
  )
}

/**
 * A History date with its Unscheduled doses in time order among scheduled doses. The count
 * stays scheduled doses only: an Unscheduled dose is never due.
 */
export function HistoryScreen({
  date,
  scheduled,
  unscheduled,
  changeHref,
  children,
}: {
  date: string
  scheduled: DoseOccurrence[]
  unscheduled: UnscheduledDose[]
  changeHref: string
  children?: ReactNode
}) {
  const heading = formatLongDay(date, TODAY)
  const logged = scheduled.filter((dose) => dose.status === 'Taken').length
  return (
    <AppShell current="/history">
      <div className="flex flex-col gap-5">
        <AppHeader title="History" />
        <nav aria-label="History date" className="flex min-w-0 items-center gap-2">
          <Button type="button" variant="outline" size="icon" aria-label="Previous day">
            <ChevronLeft aria-hidden="true" data-icon="inline-start" />
          </Button>
          <div className="min-w-0 flex-1">
            <DatePicker
              id="history-date"
              label="Choose a date"
              today={TODAY}
              max={TODAY}
              value={date}
              onValueChange={() => {}}
            />
          </div>
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="Next day"
            disabled={date >= TODAY}
          >
            <ChevronRight aria-hidden="true" data-icon="inline-start" />
          </Button>
        </nav>
        <section aria-labelledby="history-day-heading" className="flex flex-col gap-3.5">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 px-1">
            <h2 id="history-day-heading" className="text-heading font-extrabold">
              {heading}
            </h2>
            <p className="text-caption font-bold text-muted-foreground">
              {logged} of {scheduled.length} logged
            </p>
          </div>
          <ol aria-label={`Doses for ${heading}`} className="flex flex-col gap-2.5">
            <DoseRows
              rows={rowsOf(scheduled, unscheduled)}
              changeHref={changeHref}
              variant="history"
            />
          </ol>
        </section>
      </div>
      {children}
    </AppShell>
  )
}
