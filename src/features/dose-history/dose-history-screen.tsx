'use client'

import { useInfiniteQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { CalendarDays, ChevronRight } from 'lucide-react'
import Link from 'next/link'
import { Fragment, useSyncExternalStore } from 'react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { LoadingSection, Skeleton } from '@/components/ui/skeleton'
import { isArchived, type Medicine } from '@/features/medicines/contract'
import {
  MedicationBackRow,
  MedicationIdentity,
  MedicationLoadFailed,
  MedicationNotFound,
  MedicinesRefreshAlert,
} from '@/features/medicines/medication-sub-screen'
import { MedicationDetailSkeleton } from '@/features/medicines/medications-skeleton'
import type { MedicinesRead } from '@/features/medicines/queries'
import { medicationRecordHref } from '@/features/medicines/routes'
import { DoseStatusBadge } from '@/features/schedules/dose-status-badge'
import { doseSaves } from '@/features/schedules/dose-saves'
import { historyHref } from '@/features/schedules/history-date-nav'
import { LogDose } from '@/features/unscheduled-doses/log-dose'
import { unscheduledSaves } from '@/features/unscheduled-doses/unscheduled-saves'
import { formatLongDay, formatShortDay, formatTime } from '@/lib/calendar-date'
import { isMedicineType, quantityLabel, type MedicineType } from '@/lib/quantity-policy'
import type { DoseHistoryTotal } from './contract'
import { doseHistoryQuery } from './queries'
import {
  doseHistoryView,
  intakeDay,
  type DoseWindows,
  type ScheduledOverlay,
  type ShownDay,
  type ShownDose,
} from './view'

/**
 * A medication's Dose history (#388, 387·B1, B2, S2): the last dose in display type, today's,
 * the last 7 days' and the last 30 days' totals, then one card per intake day, newest first, with a
 * line per Taken dose linking to its History date. Show earlier days loads older pages. Pending
 * and Unconfirmed saves for this medication show and count, marked as saving (`view.ts`). Opens
 * from Medication detail and Archived medication detail at `?medicine=<id>&record=doses`.
 */
export function DoseHistoryScreen({
  medicinesRead,
  medicineId,
  today,
}: {
  medicinesRead: MedicinesRead
  medicineId: string
  today: string
}) {
  const medicine = medicinesRead.medicines.find((item) => item.id === medicineId)
  let body
  if (medicinesRead.loading) body = <MedicationDetailSkeleton />
  else if (!medicine)
    body = medicinesRead.loadError ? (
      <MedicationLoadFailed onRetry={medicinesRead.retry} />
    ) : (
      <MedicationNotFound />
    )
  else body = <DoseHistoryBody medicine={medicine} today={today} />
  return (
    <div className="flex flex-col gap-5 [overflow-wrap:anywhere]">
      {!medicinesRead.loading && (
        <MedicationBackRow href={medicationRecordHref(medicineId)}>
          {medicine?.label ?? 'Medication'}
        </MedicationBackRow>
      )}
      <MedicinesRefreshAlert medicinesRead={medicinesRead} />
      {body}
    </div>
  )
}

function DoseHistoryBody({ medicine, today }: { medicine: Medicine; today: string }) {
  const client = useQueryClient()
  const scheduled = doseSaves(client)
  const unscheduled = unscheduledSaves(client)
  useSyncExternalStore(scheduled.subscribe, scheduled.snapshot, scheduled.snapshot)
  useSyncExternalStore(unscheduled.subscribe, unscheduled.snapshot, unscheduled.snapshot)
  const read = useInfiniteQuery(doseHistoryQuery(medicine.id))

  const heading = (note: boolean) => (
    <>
      <MedicationIdentity medicine={medicine} />
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

  if (!read.data)
    return (
      <>
        {heading(true)}
        {read.isError ? (
          <Alert variant="destructive">
            <AlertTitle>Couldn’t load dose history.</AlertTitle>
            <AlertDescription>Check your connection.</AlertDescription>
            <Button
              variant="outline"
              className="mt-2 justify-self-start"
              disabled={read.isFetching}
              onClick={() => void read.refetch()}
            >
              Try again
            </Button>
          </Alert>
        ) : (
          <DoseHistorySkeleton />
        )}
      </>
    )

  const view = doseHistoryView({
    pages: read.data.pages,
    scheduled: scheduledOverlays(client, medicine.id),
    unscheduled: unscheduled.pendingIntakes(medicine.id),
    medicine,
    today,
  })
  const unit = (value: string) => (isMedicineType(value) ? value : medicine.unit)

  if (!view.lastDose)
    return (
      <>
        {heading(false)}
        <EmptyState
          icon={CalendarDays}
          title="No doses taken yet"
          body="Doses you log as taken show here, with how much you took."
          action={isArchived(medicine) ? undefined : <LogDose medicine={medicine} primary />}
        />
      </>
    )

  return (
    <>
      {heading(true)}
      <Summary lastDose={view.lastDose} windows={view.windows} today={today} unit={unit} />
      <section aria-label="Doses by day" className="flex flex-col gap-5">
        {view.days.map((day) => (
          <DayCard key={day.date} day={day} today={today} unit={unit} />
        ))}
      </section>
      {read.hasNextPage && (
        <div className="flex flex-col gap-3">
          {read.isFetchNextPageError && (
            <Alert variant="destructive">
              <AlertTitle>Couldn’t load earlier days.</AlertTitle>
              <Button
                variant="outline"
                className="mt-2 justify-self-start"
                disabled={read.isFetchingNextPage}
                onClick={() => void read.fetchNextPage()}
              >
                Try again
              </Button>
            </Alert>
          )}
          {!read.isFetchNextPageError && (
            <Button
              variant="outline"
              size="lg"
              className="w-full"
              disabled={read.isFetchingNextPage}
              onClick={() => void read.fetchNextPage()}
            >
              {read.isFetchingNextPage ? 'Loading…' : 'Show earlier days'}
            </Button>
          )}
        </div>
      )}
    </>
  )
}

/** This medication's pending and unconfirmed scheduled dose saves. */
function scheduledOverlays(client: QueryClient, medicineId: string): ScheduledOverlay[] {
  const store = doseSaves(client)
  return store.keys().flatMap((key) => {
    const save = store.get(key)
    const pending = save?.medicineId === medicineId ? store.pendingDose(key) : undefined
    if (!pending || !save?.attempt) return []
    const { scheduleId, dueAt, takenAt, quantity } = save.attempt.payload
    const taken =
      pending.outcome === 'Taken'
        ? { takenAt: String(takenAt), quantity: Number(quantity) }
        : undefined
    return [{ scheduleId, dueAt, taken, pending }]
  })
}

type UnitOf = (unit: string) => MedicineType

/** '1 tablet', or split by strength, newest first: '2 tablets (400 mg) · 1 tablet (200 mg)'. */
function Totals({ totals, unit }: { totals: readonly DoseHistoryTotal[]; unit: UnitOf }) {
  if (totals.length === 1) return quantityLabel(totals[0].quantity, unit(totals[0].unit))
  return totals.map(({ quantity, unit: saved, strength }, index) => (
    <Fragment key={`${strength}|${saved}`}>
      {index > 0 && ' '}
      {/* A part wraps whole, keeping its dot. */}
      <span className="inline-block">
        {quantityLabel(quantity, unit(saved))} ({strength ?? 'No strength entered'})
        {index < totals.length - 1 && ' ·'}
      </span>
    </Fragment>
  ))
}

/** A pending or unconfirmed save's badge, as History rows show it. */
function Saving({ dose }: { dose: ShownDose }) {
  if (!dose.pending) return null
  return <DoseStatusBadge status="Taken" pending={dose.pending} className="shrink-0" />
}

/** '08:10', or 'Sun 8 Nov · 20:15' before today. */
function lastDoseWhen(dose: ShownDose, today: string) {
  const day = intakeDay(dose)
  const time = formatTime(dose.takenAt)
  return day === today ? time : `${formatShortDay(day, today)} · ${time}`
}

function Summary({
  lastDose,
  windows,
  today,
  unit,
}: {
  lastDose: ShownDose
  windows: DoseWindows
  today: string
  unit: UnitOf
}) {
  const rows = [
    ['Today', windows.today],
    ['Last 7 days', windows.last7Days],
    ['Last 30 days', windows.last30Days],
  ] as const
  return (
    <section aria-label="Summary" className="flex flex-col gap-2.5">
      <div className="flex flex-col gap-1 rounded-2xl border border-border bg-card p-4">
        <p className="text-label font-extrabold tracking-eyebrow text-muted-foreground uppercase">
          Last dose
        </p>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <p className="text-display font-extrabold tabular-nums">
            {lastDoseWhen(lastDose, today)}
          </p>
          <Saving dose={lastDose} />
        </div>
        <p className="text-body-lg font-bold text-muted-foreground">
          {quantityLabel(lastDose.quantity, unit(lastDose.unit))}
        </p>
      </div>
      <dl className="flex flex-col divide-y divide-border rounded-2xl border border-border bg-card">
        {rows.map(([label, totals]) => (
          <div key={label} className="flex flex-col gap-0.5 px-4 py-3">
            <dt className="text-body-sm font-bold text-muted-foreground">{label}</dt>
            <dd className="text-body-lg font-extrabold tabular-nums">
              {totals.length ? <Totals totals={totals} unit={unit} /> : 'None taken'}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

/** A scheduled dose taken on another day names the History date it opens: '20:00 dose on Mon 26 Oct'. */
function historyNote(dose: ShownDose, today: string) {
  if (dose.kind !== 'scheduled' || intakeDay(dose) === dose.historyDate) return null
  return `${formatTime(dose.dueAt)} dose on ${formatShortDay(dose.historyDate, today)}`
}

function DayCard({ day, today, unit }: { day: ShownDay; today: string; unit: UnitOf }) {
  const title = formatLongDay(day.date, today)
  const split = day.totals.length > 1
  return (
    <section aria-label={title} className="rounded-2xl border border-border bg-card">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 px-4 pt-3.5 pb-2">
        <h3 className="text-body-lg font-extrabold">{title}</h3>
        <p className="text-body-sm font-bold text-muted-foreground tabular-nums">
          <Totals totals={day.totals} unit={unit} />
        </p>
      </div>
      <ul className="flex flex-col pb-1.5">
        {day.doses.map((dose) => {
          const note = historyNote(dose, today)
          const amount = quantityLabel(dose.quantity, unit(dose.unit))
          return (
            <li
              key={dose.kind === 'scheduled' ? `${dose.scheduleId}|${dose.dueAt}` : dose.id}
              className="border-t border-border first:border-t-0"
            >
              <Link
                href={historyHref(dose.historyDate)}
                className="flex min-h-12 items-center gap-3 px-4 py-2 outline-none hover:bg-muted focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
              >
                <span className="w-12 shrink-0 text-body-lg font-extrabold tabular-nums">
                  {formatTime(dose.takenAt)}
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="text-body-lg">
                    {split ? `${amount} · ${dose.strength ?? 'No strength entered'}` : amount}
                  </span>
                  {note && <span className="text-body-sm text-muted-foreground">{note}</span>}
                </span>
                <Saving dose={dose} />
                <ChevronRight
                  aria-hidden="true"
                  className="size-5 shrink-0 text-muted-foreground"
                />
              </Link>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

/** The summary and three day rows before the first page arrives, under one status. */
function DoseHistorySkeleton() {
  return (
    <LoadingSection label="Loading dose history" className="flex flex-col gap-5">
      <div className="flex flex-col gap-2.5">
        <Skeleton className="min-h-30 rounded-2xl" />
        <Skeleton className="min-h-52 rounded-2xl" />
      </div>
      {[0, 1, 2].map((row) => (
        <Skeleton key={row} className="min-h-28 rounded-2xl" />
      ))}
    </LoadingSection>
  )
}
