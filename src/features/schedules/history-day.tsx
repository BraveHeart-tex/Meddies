'use client'

import { useEffect, useRef, useState, type RefObject } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { buttonVariants } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Icon } from '@/components/ui/icon'
import { Item, ItemContent, ItemDescription, ItemTitle } from '@/components/ui/item'
import { dateLabel, longDateLabel } from '@/lib/calendar-date'
import { quantityLabel } from '@/lib/dose-quantity'
import { cn } from '@/lib/utils'
import type { Medicine } from '@/features/medicines/contract'
import { istanbulDate, type DoseOccurrence, type DoseOutcomeRecord } from './contract'
import { DoseActions } from './dose-actions'
import { doseSaveKey } from './dose-saves'
import { DoseStatusBadge } from './dose-status-badge'
import { dayHeadingId, historyHref, useHistoryDayFocus } from './history-date-nav'
import { doseClock as clock } from './taken-form'
import { useDoseSaves } from './use-dose-outcome-mutation'

export type HistoryDayResult =
  | { status: 'loaded'; doses: DoseOccurrence[]; medicines: Medicine[] }
  | { status: 'unavailable' }
  | { status: 'unauthorized' }

const recorded = (dose: DoseOccurrence) => dose.status === 'Taken' || dose.status === 'Skipped'

/**
 * One History date (648·H1 to H3, H5, H6). `notice: 'invalid'` means the URL named a future or
 * malformed date and this is today instead; the URL is replaced to match.
 */
export function HistoryDay({
  date,
  today,
  result,
  notice,
}: {
  date: string
  today: string
  result: HistoryDayResult
  notice?: 'invalid'
}) {
  const focusTarget = useRef<HTMLHeadingElement>(null)
  useHistoryDayFocus(focusTarget)
  useEffect(() => {
    if (notice === 'invalid') window.history.replaceState(null, '', historyHref(today))
  }, [notice, today])
  const heading = longDateLabel(date, today)

  return (
    <section aria-labelledby={dayHeadingId} className="flex flex-col gap-3.5">
      {notice === 'invalid' && (
        <Alert>
          <Icon name="warning" size={16} />
          <AlertTitle>That date is not available.</AlertTitle>
          <AlertDescription>
            History shows dates up to today. Showing today instead.
          </AlertDescription>
        </Alert>
      )}
      {result.status === 'unauthorized' ? (
        <Alert role="alert" variant="destructive">
          <AlertTitle id={dayHeadingId} ref={focusTarget} tabIndex={-1}>
            Your session ended.
          </AlertTitle>
          <AlertDescription>
            <Link className="underline" href="/">
              Sign in again
            </Link>{' '}
            to view history.
          </AlertDescription>
        </Alert>
      ) : result.status === 'unavailable' ? (
        <Alert role="alert" variant="destructive">
          <AlertTitle id={dayHeadingId} ref={focusTarget} tabIndex={-1}>
            History for {dateLabel(date, today)} could not be loaded.
          </AlertTitle>
          <AlertDescription className="flex flex-col items-start gap-2">
            <p>Connect to the internet and retry. Your records have not changed.</p>
            {/* A full load reads this date again. */}
            <a className={buttonVariants({ variant: 'outline' })} href={historyHref(date)}>
              Retry this date
            </a>
          </AlertDescription>
        </Alert>
      ) : result.doses.length === 0 ? (
        <Card variant="dashed">
          <CardContent>
            <h2
              id={dayHeadingId}
              ref={focusTarget}
              tabIndex={-1}
              className="font-extrabold outline-none"
            >
              {date === today
                ? 'No doses were due before now today.'
                : `No doses were scheduled on ${heading}.`}
            </h2>
          </CardContent>
        </Card>
      ) : (
        <LoadedDay
          date={date}
          today={today}
          heading={heading}
          doses={result.doses}
          medicines={result.medicines}
          focusTarget={focusTarget}
        />
      )}
    </section>
  )
}

function LoadedDay({
  date,
  today,
  heading,
  doses,
  medicines,
  focusTarget,
}: {
  date: string
  today: string
  heading: string
  doses: DoseOccurrence[]
  medicines: Medicine[]
  focusTarget: RefObject<HTMLHeadingElement | null>
}) {
  const logged = doses.filter(recorded).length
  return (
    <>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 px-1">
        <h2
          id={dayHeadingId}
          ref={focusTarget}
          tabIndex={-1}
          // Announced on a date change: 'Thursday 5 November, 7 doses' (FE-648 a11y).
          aria-label={`${heading}, ${doses.length} ${doses.length === 1 ? 'dose' : 'doses'}`}
          className="text-heading font-extrabold outline-none"
        >
          {heading}
        </h2>
        <p className="text-caption font-bold text-muted-foreground">
          {logged} of {doses.length} {date === today ? 'so far' : 'logged'}
        </p>
      </div>
      <ol aria-label={`Doses for ${date}`} className="flex flex-col gap-2.5">
        {doses.map((dose) => (
          <HistoryDoseRow
            key={dose.id}
            dose={dose}
            date={date}
            today={today}
            medicine={medicines.find((item) => item.id === dose.medicineId)}
          />
        ))}
      </ol>
    </>
  )
}

/** Today's row anatomy in time order. Not logged rows are dashed and not buttons (D11). */
function HistoryDoseRow({
  dose,
  date,
  today,
  medicine,
}: {
  dose: DoseOccurrence
  date: string
  today: string
  medicine?: Medicine
}) {
  const [confirmed, setConfirmed] = useState<DoseOutcomeRecord | null>(null)
  const router = useRouter()
  const saves = useDoseSaves()
  const serverRevision = 'record' in dose ? (dose.record.revision ?? 0) : 0
  const current =
    confirmed && (confirmed.revision ?? 0) > serverRevision
      ? ({ ...dose, status: confirmed.outcome, record: confirmed } as DoseOccurrence)
      : dose
  const done = recorded(current)
  const unit = medicine?.unit ?? 'tablet'
  const takenAt = current.status === 'Taken' ? current.record.takenAt : ''
  const takenDate = takenAt ? istanbulDate(new Date(takenAt)) : ''
  return (
    <Item
      render={<li data-dose-id={dose.id} />}
      variant={done ? 'card' : 'dashed'}
      className="has-[[data-row-trigger]:active]:scale-[0.98] has-[[data-row-trigger]:active]:bg-muted motion-reduce:has-[[data-row-trigger]:active]:scale-100"
    >
      <span
        aria-hidden="true"
        className={cn('w-11.5 shrink-0 font-extrabold', done && 'text-muted-foreground')}
      >
        <time dateTime={dose.dueAt}>{clock(dose.dueAt)}</time>
      </span>
      <ItemContent className="gap-0.75">
        <ItemTitle>
          <h3 id={`dose-${dose.id}`} tabIndex={-1}>
            <span className="sr-only">{clock(dose.dueAt)} · </span>
            {medicine?.label ?? 'Medicine'}
          </h3>
        </ItemTitle>
        <ItemDescription>
          {[medicine?.strength, quantityLabel(dose.quantity, unit)].filter(Boolean).join(' · ')}
          {current.status === 'Taken' &&
            current.record.quantity !== dose.quantity &&
            ` · took ${quantityLabel(current.record.quantity, unit)}`}
          {takenDate && takenDate !== date && (
            <span className="block font-bold text-foreground">
              Taken on {dateLabel(takenDate, today).replace(/^Today, /, '')}
            </span>
          )}
          {!done && date === today && (
            <span className="block font-bold text-foreground">Record it on Today</span>
          )}
        </ItemDescription>
      </ItemContent>
      <DoseStatusBadge
        id={`dose-status-${dose.id}`}
        pending={saves.pendingDose(doseSaveKey(dose))}
        status={current.status}
        time={
          takenAt ? (
            <time data-dose-intake-time dateTime={takenAt}>
              {clock(takenAt)}
            </time>
          ) : undefined
        }
      />
      {done && medicine && (
        <DoseActions
          dose={current}
          medicine={medicine}
          appearance="row"
          describedBy={`dose-status-${dose.id}`}
          refresh={async () => {
            router.refresh()
            return false
          }}
          onRecorded={(record) => {
            setConfirmed(record)
            router.refresh()
          }}
        />
      )}
    </Item>
  )
}
