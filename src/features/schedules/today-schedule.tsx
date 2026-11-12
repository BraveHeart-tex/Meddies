'use client'

import { Calendar, Check, Clock, Pill } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import { formatShortDay, formatTime } from '@/lib/calendar-date'
import { quantityLabel } from '@/lib/dose-quantity'
import { cn } from '@/lib/utils'
import { Button, buttonVariants } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { EmptyState } from '@/components/ui/empty-state'
import { Item, ItemContent, ItemDescription, ItemTitle } from '@/components/ui/item'
import type { Medicine } from '@/features/medicines/contract'
import { useMedicines } from '@/features/medicines/queries'
import { medicationSetupHref, medicationsHref } from '@/features/medicines/routes'
import { istanbulDate, type DoseOccurrence, type DoseOutcomeRecord, type Today } from './contract'
import { DoseStatusBadge } from './dose-status-badge'
import { DoseActions, type DoseDrawerOpener } from './dose-actions'
import { NextDose } from './next-dose'
import { TodayDosesLoading } from './today-skeleton'
import { scheduleToday } from './occurrences'
import type { SchedulesRead } from './queries'
import { useScheduleNow } from './use-schedule-now'
import { doseSaveKey } from './dose-saves'
import { useDoseSaves } from './use-dose-outcome-mutation'

export function TodaySchedule({
  schedulesRead: { snapshot, loading, loadError, refreshFailed, refreshing, retry, ensureFresh },
  serverNow,
}: {
  schedulesRead: SchedulesRead
  /** The latest server scheduling time; the clock re-anchors on each new one. */
  serverNow: string
}) {
  const {
    medicines,
    loading: medicinesLoading,
    loadError: medicinesLoadError,
    refreshFailed: medicinesRefreshFailed,
    retry: retryMedicines,
  } = useMedicines()
  const medicinesError = medicinesLoadError || medicinesRefreshFailed
  const name = (id: string) =>
    medicines.find((medicine) => medicine.id === id)?.label ?? 'Medication'
  const now = useScheduleNow(serverNow)
  // Statuses follow the scheduling clock. Records cover only the snapshot's date, so a new day
  // waits for its own read instead of inventing coverage.
  const today = useMemo(() => {
    if (!snapshot || istanbulDate(new Date(now)) !== snapshot.date) return null
    return scheduleToday(snapshot.schedules, new Date(now), snapshot.records)
  }, [snapshot, now])
  const awaitingDay = snapshot !== undefined && today === null
  useEffect(() => {
    if (awaitingDay) ensureFresh()
  }, [awaitingDay, ensureFresh])
  const showLoading =
    loading || (awaitingDay && !refreshFailed) || (medicinesLoading && medicines.length === 0)
  const heroOpener = useRef<DoseDrawerOpener>(null)
  // Saves belong to the session, so their badges survive leaving Today (#127).
  const saves = useDoseSaves()
  const pendingDose = (dose: DoseOccurrence) => saves.pendingDose(doseSaveKey(dose))
  /** F6: what an unconfirmed attempt tried to save, on its row. */
  function retryNote(dose: DoseOccurrence) {
    const attempt = saves.retryDetails(doseSaveKey(dose))
    if (!attempt) return ''
    const unit = medicines.find((item) => item.id === dose.medicineId)?.unit ?? 'tablet'
    return attempt.takenAt
      ? `Taken at ${formatTime(attempt.takenAt)}, ${quantityLabel(attempt.quantity, unit)} · might not have saved · open to try again`
      : 'Skipped · might not have saved · open to try again'
  }
  const [intakeMessage, setIntakeMessage] = useState('')
  const doseText = (dose: DoseOccurrence, quantity = dose.quantity) => {
    const medicine = medicines.find((item) => item.id === dose.medicineId)
    return `${quantity} ${medicine?.unit ?? 'unit'}${quantity === 1 ? '' : 's'}`
  }
  function announceOutcome(dose: DoseOccurrence, record: DoseOutcomeRecord, reconciled = false) {
    const heading = document.getElementById(`dose-${dose.id}`)
    const active = document.activeElement
    if (active === document.body || heading?.parentElement?.contains(active)) heading?.focus()
    // A confirmed save announces itself with a Toast from DoseActions (648·F2).
    if (!reconciled) return setIntakeMessage('')
    const description = `${name(dose.medicineId)} scheduled for ${formatTime(dose.dueAt)}`
    setIntakeMessage(`${description} was already recorded as ${record.outcome.toLowerCase()}.`)
  }

  return (
    <section aria-labelledby="today-heading" className="flex flex-col gap-5">
      <h2 id="today-heading" className="sr-only">
        Your doses
      </h2>
      {/* The skeleton's status is the section's only one while it loads (DESIGN.md). */}
      <div role={showLoading ? undefined : 'status'} className="empty:sr-only">
        {intakeMessage && (
          <Alert role="none" variant="confirmation" className="[overflow-wrap:anywhere]">
            <span className="grid size-6.5 place-items-center [&>svg]:size-3.5 rounded-full bg-dose-taken text-dose-taken-foreground">
              <Check aria-hidden="true" />
            </span>
            <AlertDescription className="font-bold">{intakeMessage}</AlertDescription>
          </Alert>
        )}
      </div>
      {showLoading && <TodayDosesLoading />}
      {medicinesError && (
        <Alert role={medicines.length === 0 ? 'alert' : 'status'}>
          <AlertDescription className="flex flex-col items-start gap-2 text-foreground">
            <p>
              {medicines.length === 0
                ? "Your medications didn't load just now, so Today can't show your doses. Check your connection and try again."
                : "Medication details didn't update just now. Showing the last list that loaded."}
            </p>
            <Button variant="outline" onClick={retryMedicines}>
              Try loading medications again
            </Button>
          </AlertDescription>
        </Alert>
      )}
      {(loadError || refreshFailed) && (
        <Alert>
          <AlertDescription className="flex flex-col items-start gap-2 text-foreground">
            <p>Today didn&apos;t update just now. Check your connection and try again.</p>
            <Button variant="outline" disabled={refreshing} onClick={retry}>
              {refreshing ? 'Retrying…' : 'Try again'}
            </Button>
          </AlertDescription>
        </Alert>
      )}
      {today &&
        (!medicinesError || medicines.length > 0) &&
        (!medicinesLoading || medicines.length > 0) && (
          <>
            {today.next && today.doses.length > 0 && (
              <NextDose
                dose={today.next}
                pending={pendingDose(today.next)}
                date={today.date}
                medicine={medicines.find((item) => item.id === today.next?.medicineId)}
                name={name(today.next.medicineId)}
                doseText={doseText(today.next)}
                onRecord={
                  today.doses.some((dose) => dose.id === today.next?.id) &&
                  medicines.some((item) => item.id === today.next?.medicineId)
                    ? (outcome) => heroOpener.current?.open(outcome)
                    : undefined
                }
              />
            )}
            {today.doses.length ? (
              <section aria-label="Today’s doses" className="flex flex-col gap-3.5">
                <ul aria-label="Today's doses" className="flex flex-col gap-2.5">
                  {[
                    {
                      label: 'To log',
                      doses: today.doses.filter(
                        (dose) => dose.status === 'Due now' || dose.status === 'Not logged',
                      ),
                    },
                    {
                      label: 'Later today',
                      doses: today.doses.filter((dose) => dose.status === 'Upcoming'),
                    },
                    {
                      label: 'Logged',
                      doses: today.doses.filter(
                        (dose) => dose.status === 'Taken' || dose.status === 'Skipped',
                      ),
                    },
                  ].flatMap((group) =>
                    group.doses.length
                      ? [
                          <li
                            key={group.label}
                            role="presentation"
                            className="px-1 pt-2.5 first:pt-0"
                          >
                            <h3 className="text-heading font-extrabold">
                              {group.label} · {group.doses.length}
                            </h3>
                          </li>,
                          ...group.doses.map((dose) => {
                            const medicine = medicines.find((item) => item.id === dose.medicineId)
                            const done = dose.status === 'Taken' || dose.status === 'Skipped'
                            const recordedAt =
                              dose.status === 'Taken'
                                ? dose.record.takenAt
                                : dose.status === 'Skipped'
                                  ? dose.record.recordedAt
                                  : ''
                            return (
                              <Item
                                key={dose.id}
                                render={<li data-dose-id={dose.id} />}
                                variant={
                                  dose.status === 'Not logged' || dose.status === 'Due now'
                                    ? 'attention'
                                    : 'card'
                                }
                                className="grid grid-cols-[2.875rem_minmax(0,1fr)_auto] max-[360px]:grid-cols-[2.875rem_minmax(0,1fr)] has-[[data-row-trigger]:active]:scale-[0.98] has-[[data-row-trigger]:active]:bg-muted motion-reduce:has-[[data-row-trigger]:active]:scale-100 [&_[data-slot=alert]]:col-span-full"
                              >
                                <span
                                  aria-hidden="true"
                                  className={cn(
                                    'w-11.5 shrink-0 font-extrabold',
                                    done && 'text-muted-foreground',
                                  )}
                                >
                                  <time dateTime={dose.dueAt}>{formatTime(dose.dueAt)}</time>
                                </span>
                                <ItemContent className="min-w-0 gap-0.75">
                                  <ItemTitle>
                                    <h4
                                      id={`dose-${dose.id}`}
                                      tabIndex={-1}
                                      className="outline-none"
                                    >
                                      <span className="sr-only">{formatTime(dose.dueAt)} · </span>
                                      {name(dose.medicineId)}
                                    </h4>
                                  </ItemTitle>
                                  <ItemDescription>
                                    {[medicine?.strength, doseText(dose)]
                                      .filter(Boolean)
                                      .join(' · ')}
                                    {dose.status === 'Taken' &&
                                      dose.record.quantity !== dose.quantity &&
                                      ` · took ${doseText(dose, dose.record.quantity)}`}
                                    {recordedAt &&
                                      istanbulDate(new Date(recordedAt)) !== today.date &&
                                      ` · ${dose.status === 'Taken' ? 'taken' : 'skipped'} on ${formatShortDay(recordedAt, today.date)}`}
                                    {retryNote(dose) && (
                                      <span className="block font-bold text-foreground">
                                        {retryNote(dose)}
                                      </span>
                                    )}
                                  </ItemDescription>
                                </ItemContent>
                                <DoseStatusBadge
                                  className="max-w-full whitespace-normal max-[360px]:col-start-2 max-[360px]:justify-self-start"
                                  id={`dose-status-${dose.id}`}
                                  pending={pendingDose(dose)}
                                  status={dose.status}
                                  time={
                                    recordedAt ? (
                                      <time dateTime={recordedAt}>{formatTime(recordedAt)}</time>
                                    ) : undefined
                                  }
                                />
                                {medicine && (
                                  <DoseActions
                                    dose={dose}
                                    medicine={medicine}
                                    appearance="row"
                                    todayDate={today.date}
                                    describedBy={`dose-status-${dose.id}`}
                                    opener={dose.id === today.next?.id ? heroOpener : undefined}
                                    onRecorded={(record) => announceOutcome(dose, record)}
                                  />
                                )}
                              </Item>
                            )
                          }),
                        ]
                      : [],
                  )}
                </ul>
              </section>
            ) : (
              <TodayEmptyState
                medicines={medicines}
                hasSchedules={!!snapshot?.schedules.length}
                today={today}
                name={name}
              />
            )}
          </>
        )}
      {!loadError && !refreshFailed && (
        <Button variant="ghost" className="self-center" disabled={refreshing} onClick={retry}>
          {refreshing && !loading ? 'Refreshing…' : 'Refresh Today'}
        </Button>
      )}
    </section>
  )
}

function TodayEmptyState({
  medicines,
  hasSchedules,
  today: { next, date },
  name,
}: {
  medicines: Medicine[]
  hasSchedules: boolean
  today: Today
  name: (medicineId: string) => string
}) {
  if (medicines.length === 0)
    return (
      <EmptyState
        icon={Pill}
        title="No medications here yet"
        body="Add your first one and Today will list its doses."
        action={
          <Link href={medicationsHref({ mode: 'add' })} className={buttonVariants({ size: 'lg' })}>
            Add medication
          </Link>
        }
      />
    )
  if (!hasSchedules) {
    const [only] = medicines
    const single = medicines.length === 1
    return (
      <EmptyState
        icon={Clock}
        title="No doses to show yet"
        body={
          single
            ? `Today won't list ${only.label} until it has a schedule.`
            : "Today won't list your medications until they have a schedule."
        }
        action={
          <Link
            href={single ? medicationSetupHref(only.id) : medicationsHref({ mode: 'list' })}
            className={buttonVariants({ size: 'lg' })}
          >
            {single ? 'Set schedule' : 'Open Medications'}
          </Link>
        }
      />
    )
  }
  return (
    <EmptyState
      icon={Calendar}
      title="Nothing to take today"
      body={
        next
          ? `You're all set. Next is ${name(next.medicineId)} on ${formatShortDay(next.dueAt, date)} at ${formatTime(next.dueAt)}.`
          : "You're all set."
      }
    />
  )
}
