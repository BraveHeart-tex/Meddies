'use client'

import { ChevronRight } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import type { DoseHistoryDay, DoseHistoryDose } from '@/features/dose-history/contract'
import { DoseStatusBadge } from '@/features/schedules/dose-status-badge'
import { historyHref } from '@/features/schedules/history-date-nav'
import { formatLongDay, formatTime } from '@/lib/calendar-date'
import { TODAY } from '../lab-fixtures'
import { ibuprofenHistory, savingDoseAt } from './dose-history-model'
import {
  amountText,
  DoseHistoryHeader,
  Frame,
  historyNote,
  InView,
  lastDoseWhen,
  Totals,
  doseFacts,
} from './dose-history-parts'

const summary = ibuprofenHistory.summary!
const windows = [
  ['Today', summary.today],
  ['Last 7 days', summary.last7Days],
  ['Last 30 days', summary.last30Days],
] as const

/** Today's 08:00 dose is still saving: it shows and counts, marked like History's rows. */
function Saving({ dose }: { dose: DoseHistoryDose }) {
  if (dose.takenAt !== savingDoseAt) return null
  return (
    <DoseStatusBadge
      status="Taken"
      pending={{ id: dose.takenAt, outcome: 'Taken' }}
      className="shrink-0"
    />
  )
}

/** The screen: header, summary, then the first page of days, newest first, and Show earlier days. */
function DoseHistoryScreen({ end }: { end?: boolean }) {
  const more = (
    <Button variant="outline" size="lg" className="w-full">
      Show earlier days
    </Button>
  )
  return (
    <Frame>
      <DoseHistoryHeader />
      <CardSummary />
      <section aria-label="Doses by day" className="flex flex-col gap-5">
        {ibuprofenHistory.days.map((day) => (
          <CardDay key={day.date} day={day} />
        ))}
      </section>
      {end ? <InView>{more}</InView> : more}
    </Frame>
  )
}

/* 387·B1 and 387·B2: the last dose leads in large type; the windows stack label over value; each
   day is one card with its total in the header and a line per dose. */

function LastDoseCard({ dose }: { dose: DoseHistoryDose }) {
  return (
    <div className="flex flex-col gap-1 rounded-2xl border border-border bg-card p-4">
      <p className="text-label font-extrabold tracking-eyebrow text-muted-foreground uppercase">
        Last dose
      </p>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <p className="text-display font-extrabold tabular-nums">{lastDoseWhen(dose)}</p>
        <Saving dose={dose} />
      </div>
      <p className="text-body-lg font-bold text-muted-foreground">{amountText(dose)}</p>
    </div>
  )
}

function CardSummary() {
  return (
    <section aria-label="Summary" className="flex flex-col gap-2.5">
      <LastDoseCard dose={summary.lastDose!} />
      <dl className="flex flex-col divide-y divide-border rounded-2xl border border-border bg-card">
        {windows.map(([label, totals]) => (
          <div key={label} className="flex flex-col gap-0.5 px-4 py-3">
            <dt className="text-body-sm font-bold text-muted-foreground">{label}</dt>
            <dd className="text-body-lg font-extrabold tabular-nums">
              <Totals totals={totals} />
            </dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

function CardDay({ day }: { day: DoseHistoryDay }) {
  const title = formatLongDay(day.date, TODAY)
  return (
    <section aria-label={title} className="rounded-2xl border border-border bg-card">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 px-4 pt-3.5 pb-2">
        <h3 className="text-body-lg font-extrabold">{title}</h3>
        <p className="text-body-sm font-bold text-muted-foreground tabular-nums">
          <Totals totals={day.totals} />
        </p>
      </div>
      <ul className="flex flex-col pb-1.5">
        {day.doses.map((dose) => {
          const note = historyNote(dose)
          return (
            <li key={dose.takenAt} className="border-t border-border first:border-t-0">
              <Link
                href={historyHref(dose.historyDate)}
                className="flex min-h-12 items-center gap-3 px-4 py-2 outline-none hover:bg-muted focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
              >
                <span className="w-12 shrink-0 text-body-lg font-extrabold tabular-nums">
                  {formatTime(dose.takenAt)}
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="text-body-lg">{doseFacts(dose, day.totals.length > 1)}</span>
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

export const CardsTopScreen = () => <DoseHistoryScreen />
export const CardsEndScreen = () => <DoseHistoryScreen end />
