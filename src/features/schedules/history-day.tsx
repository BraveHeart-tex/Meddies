'use client'

import { Calendar, Pill } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useRef, type RefObject } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button, buttonVariants } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Item, ItemContent, ItemDescription, ItemTitle } from '@/components/ui/item'
import {
  formatLongDay,
  formatShortDay,
  formatTime,
  formatTodayRelativeDay,
} from '@/lib/calendar-date'
import { quantityLabel } from '@/lib/dose-quantity'
import { cn } from '@/lib/utils'
import type { Medicine } from '@/features/medicines/contract'
import { medicationsHref } from '@/features/medicines/routes'
import { istanbulDate, type DoseOccurrence } from './contract'
import { HistoryInvalidDateNotice } from './history-invalid-date-notice'
import { DoseActions } from './dose-actions'
import { doseSaveKey, type RecordCheck } from './dose-saves'
import { DoseStatusBadge } from './dose-status-badge'
import { dayHeadingId, historyHref, useHistoryDayFocus } from './history-date-nav'
import { applyRecord, currentRecord, readFreshHistoryDay, sameDose } from './queries'
import { useDoseSaves } from './use-dose-outcome-mutation'

export type HistoryDayResult =
  | { status: 'loaded'; doses: DoseOccurrence[]; medicines: Medicine[] }
  | { status: 'unavailable'; retry: () => void }

const recorded = (dose: DoseOccurrence) => dose.status === 'Taken' || dose.status === 'Skipped'

/**
 * One History date (648·H1, H2, H5, H6, FE-752·B). `notice: 'invalid'` means the URL named a future or
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
  const heading = formatLongDay(date, today)

  // The notice is its own page section, 20px above the day (FE-690), so this renders two
  // siblings of History's section column.
  return (
    <>
      {notice === 'invalid' && <HistoryInvalidDateNotice />}
      <section aria-labelledby={dayHeadingId} className="flex flex-col gap-3.5">
        {result.status === 'unavailable' ? (
          <Alert role="alert" variant="destructive">
            <AlertTitle id={dayHeadingId} ref={focusTarget} tabIndex={-1} className="outline-none">
              History for {formatTodayRelativeDay(date, today)} didn&apos;t load just now.
            </AlertTitle>
            <AlertDescription className="flex flex-col items-start gap-2">
              <p>Check your connection and try again. Your records haven&apos;t changed.</p>
              <Button type="button" variant="outline" onClick={result.retry}>
                Try this date again
              </Button>
            </AlertDescription>
          </Alert>
        ) : result.doses.length === 0 ? (
          <EmptyDay
            date={date}
            today={today}
            heading={heading}
            hasMedicines={result.medicines.length > 0}
            focusTarget={focusTarget}
          />
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
    </>
  )
}

/** Start with no medicines, otherwise Clear (FE-752·B). The title stays the day heading. */
function EmptyDay({
  date,
  today,
  heading,
  hasMedicines,
  focusTarget,
}: {
  date: string
  today: string
  heading: string
  hasMedicines: boolean
  focusTarget: RefObject<HTMLHeadingElement | null>
}) {
  const content = !hasMedicines
    ? {
        icon: Pill,
        title: 'No doses here yet',
        body: 'Doses you log will show here day by day.',
        action: (
          <Link href={medicationsHref({ mode: 'add' })} className={buttonVariants({ size: 'lg' })}>
            Add medication
          </Link>
        ),
      }
    : date === today
      ? {
          icon: Calendar,
          title: 'Nothing due yet today',
          body: "Doses will show here once they're due.",
        }
      : {
          icon: Calendar,
          title: `Nothing was scheduled on ${heading}`,
          body: 'Use the arrows to see another day.',
        }
  return <EmptyState {...content} titleAs="h2" titleId={dayHeadingId} titleRef={focusTarget} />
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
          // Announced on a date change: 'Thursday, 5 November, 7 doses' (FE-648 a11y).
          aria-label={`${heading}, ${doses.length} ${doses.length === 1 ? 'dose' : 'doses'}`}
          className="text-heading font-extrabold outline-none"
        >
          {heading}
        </h2>
        <p className="text-caption font-bold text-muted-foreground">
          {logged} of {doses.length} {date === today ? 'so far' : 'logged'}
        </p>
      </div>
      <ol aria-label={`Doses for ${heading}`} className="flex flex-col gap-2.5">
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
  const client = useQueryClient()
  const saves = useDoseSaves()
  /** Reads this History date again and returns this dose's record, if any (FE-648 F4). */
  async function checkRecorded(): Promise<RecordCheck> {
    const doses = await readFreshHistoryDay(client, date).catch(() => null)
    if (!doses) return 'unknown'
    const found = doses.find((item) => sameDose(item, dose))
    return found && 'record' in found ? { record: found.record } : 'missing'
  }
  const done = recorded(dose)
  const unit = medicine?.unit ?? 'tablet'
  const takenAt = dose.status === 'Taken' ? dose.record.takenAt : ''
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
        <time dateTime={dose.dueAt}>{formatTime(dose.dueAt)}</time>
      </span>
      <ItemContent className="gap-0.75">
        <ItemTitle>
          <h3 id={`dose-${dose.id}`} tabIndex={-1}>
            <span className="sr-only">{formatTime(dose.dueAt)} · </span>
            {medicine?.label ?? 'Medication'}
          </h3>
        </ItemTitle>
        <ItemDescription>
          {[medicine?.strength, quantityLabel(dose.quantity, unit)].filter(Boolean).join(' · ')}
          {dose.status === 'Taken' &&
            dose.record.quantity !== dose.quantity &&
            ` · took ${quantityLabel(dose.record.quantity, unit)}`}
          {takenDate && takenDate !== date && (
            <span className="block font-bold text-foreground">
              Taken on {formatShortDay(takenDate, today)}
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
        status={dose.status}
        time={
          takenAt ? (
            <time data-dose-intake-time dateTime={takenAt}>
              {formatTime(takenAt)}
            </time>
          ) : undefined
        }
      />
      {done && medicine && (
        <DoseActions
          dose={dose}
          medicine={medicine}
          appearance="row"
          describedBy={`dose-status-${dose.id}`}
          refresh={async () => typeof (await checkRecorded()) === 'object'}
          checkRecorded={checkRecorded}
          onRecorded={(record) => {
            const superseded =
              (currentRecord(client, record)?.revision ?? 0) > (record.revision ?? 0)
            void applyRecord(client, record)
            return superseded
          }}
        />
      )}
    </Item>
  )
}
