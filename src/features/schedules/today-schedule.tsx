'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { quantityLabel } from '@/lib/dose-quantity'
import { useQueryClient } from '@tanstack/react-query'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Card, CardContent } from '@/components/ui/card'
import { Icon } from '@/components/ui/icon'
import { Item, ItemContent, ItemDescription, ItemTitle } from '@/components/ui/item'
import { useMedicines } from '@/features/medicines/queries'
import { istanbulDate, type DoseOccurrence, type DoseOutcomeRecord } from './contract'
import { doseClock as clock } from './taken-form'
import { DoseStatusBadge } from './dose-status-badge'
import { DoseActions, type DoseDrawerOpener } from './dose-actions'
import { NextDose } from './next-dose'
import { TodayDosesLoading } from './today-skeleton'
import { scheduleToday } from './occurrences'
import { applyRecord, currentRecord, readFreshSnapshot, type SchedulesRead } from './queries'
import { useScheduleNow } from './use-schedule-now'
import { doseSaveKey, type RecordCheck } from './dose-saves'
import { useDoseSaves } from './use-dose-outcome-mutation'

export function TodaySchedule({
  schedulesRead: { snapshot, loading, loadError, refreshFailed, refreshing, retry, ensureFresh },
  serverNow,
}: {
  schedulesRead: SchedulesRead
  /** The latest server scheduling time; the clock re-anchors on each new one. */
  serverNow: string
}) {
  const queryClient = useQueryClient()
  const {
    medicines,
    loading: medicinesLoading,
    loadError: medicinesLoadError,
    refreshFailed: medicinesRefreshFailed,
    retry: retryMedicines,
  } = useMedicines()
  const medicinesError = medicinesLoadError || medicinesRefreshFailed
  const name = (id: string) => medicines.find((medicine) => medicine.id === id)?.label ?? 'Medicine'
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
  // Saves belong to the session, so their badges survive leaving Today (FE-674).
  const saves = useDoseSaves()
  const pendingDose = (dose: DoseOccurrence) => saves.pendingDose(doseSaveKey(dose))
  /** F6: what an unconfirmed attempt tried to save, on its row. */
  function retryNote(dose: DoseOccurrence) {
    const attempt = saves.retryDetails(doseSaveKey(dose))
    if (!attempt) return ''
    const unit = medicines.find((item) => item.id === dose.medicineId)?.unit ?? 'tablet'
    return attempt.takenAt
      ? `Taken at ${clock(attempt.takenAt)}, ${quantityLabel(attempt.quantity, unit)} · open to retry`
      : 'Skipped · open to retry'
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
    // A confirmed save announces itself with a Toast from DoseActions (FE-648 F2).
    if (!reconciled) return setIntakeMessage('')
    const description = `${name(dose.medicineId)} scheduled for ${clock(dose.dueAt)}`
    setIntakeMessage(`${description} was already recorded as ${record.outcome.toLowerCase()}.`)
  }

  function showOutcome(dose: DoseOccurrence, record: DoseOutcomeRecord) {
    const superseded = (currentRecord(queryClient, record)?.revision ?? 0) > (record.revision ?? 0)
    announceOutcome(dose, record)
    void applyRecord(queryClient, record)
    return superseded
  }

  /**
   * Reloads Today and returns this dose's record, if any. `announce` reports a found record as
   * already recorded (409 recovery); the uncertain-save check (FE-648 F4) stays quiet.
   */
  async function checkRecorded(dose: DoseOccurrence, announce: boolean): Promise<RecordCheck> {
    const fresh = await readFreshSnapshot(queryClient).catch(() => null)
    if (!fresh) return 'unknown'
    const found = fresh.records.find(
      (item) => item.scheduleId === dose.scheduleId && item.dueAt === dose.dueAt,
    )
    if (found && announce) announceOutcome(dose, found, true)
    return found ? { record: found } : 'missing'
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
            <span className="grid size-6.5 place-items-center rounded-full bg-dose-taken text-dose-taken-foreground">
              <Icon name="check" size={14} strokeWidth={2.4} />
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
                ? 'Your medicines could not be loaded. Today is unavailable until they can be refreshed.'
                : 'Medicine details could not be refreshed. Showing the last successful list.'}
            </p>
            <Button variant="outline" onClick={retryMedicines}>
              Retry loading medicines
            </Button>
          </AlertDescription>
        </Alert>
      )}
      {(loadError || refreshFailed) && (
        <Alert>
          <AlertDescription className="flex flex-col items-start gap-2 text-foreground">
            <p>Today could not be refreshed. Connect to the internet and retry.</p>
            <Button variant="outline" disabled={refreshing} onClick={retry}>
              {refreshing ? 'Retrying…' : 'Retry Today'}
            </Button>
          </AlertDescription>
        </Alert>
      )}
      {today &&
        (!medicinesError || medicines.length > 0) &&
        (!medicinesLoading || medicines.length > 0) && (
          <>
            {today.next && (
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
              <section aria-labelledby="today-doses-heading" className="flex flex-col gap-3.5">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 px-1">
                  <h3 id="today-doses-heading" className="text-heading font-extrabold">
                    Today’s doses
                  </h3>
                  <p className="text-caption font-bold text-muted-foreground">
                    {
                      today.doses.filter(
                        (dose) => dose.status === 'Taken' || dose.status === 'Skipped',
                      ).length
                    }{' '}
                    of {today.doses.length} logged
                  </p>
                </div>
                <ul aria-label="Today's doses" className="flex flex-col gap-2.5">
                  {[...today.doses]
                    .sort((left, right) => {
                      const rank = (dose: DoseOccurrence) =>
                        dose.status === 'Upcoming'
                          ? 1
                          : dose.status === 'Taken' || dose.status === 'Skipped'
                            ? 2
                            : 0
                      return rank(left) - rank(right) || left.dueAt.localeCompare(right.dueAt)
                    })
                    .map((dose) => {
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
                          className="has-[[data-row-trigger]:active]:scale-[0.98] has-[[data-row-trigger]:active]:bg-muted motion-reduce:has-[[data-row-trigger]:active]:scale-100"
                        >
                          <span
                            aria-hidden="true"
                            className={cn(
                              'w-11.5 shrink-0 font-extrabold',
                              done && 'text-muted-foreground',
                            )}
                          >
                            <time dateTime={dose.dueAt}>{clock(dose.dueAt)}</time>
                          </span>
                          <ItemContent className="gap-0.75">
                            <ItemTitle>
                              <h4 id={`dose-${dose.id}`} tabIndex={-1}>
                                <span className="sr-only">{clock(dose.dueAt)} · </span>
                                {name(dose.medicineId)}
                              </h4>
                            </ItemTitle>
                            <ItemDescription>
                              {[medicine?.strength, doseText(dose)].filter(Boolean).join(' · ')}
                              {dose.status === 'Taken' &&
                                dose.record.quantity !== dose.quantity &&
                                ` · took ${doseText(dose, dose.record.quantity)}`}
                              {recordedAt &&
                                istanbulDate(new Date(recordedAt)) !== today.date &&
                                ` · ${dose.status === 'Taken' ? 'taken' : 'skipped'} on ${istanbulDate(new Date(recordedAt))}`}
                              {retryNote(dose) && (
                                <span className="block font-bold text-foreground">
                                  {retryNote(dose)}
                                </span>
                              )}
                            </ItemDescription>
                          </ItemContent>
                          <DoseStatusBadge
                            id={`dose-status-${dose.id}`}
                            pending={pendingDose(dose)}
                            status={dose.status}
                            time={
                              recordedAt ? (
                                <time dateTime={recordedAt}>{clock(recordedAt)}</time>
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
                              refresh={async () =>
                                typeof (await checkRecorded(dose, true)) === 'object'
                              }
                              checkRecorded={() => checkRecorded(dose, false)}
                              onRecorded={(record) => showOutcome(dose, record)}
                            />
                          )}
                        </Item>
                      )
                    })}
                </ul>
              </section>
            ) : (
              <Card variant="dashed">
                <CardContent>
                  <p>No doses scheduled for today.</p>
                </CardContent>
              </Card>
            )}
          </>
        )}
      <p className="px-6 text-center text-body-sm text-muted-foreground">
        All dates and times use Europe/Istanbul, wherever your device is.
      </p>
      {!loadError && !refreshFailed && (
        <Button variant="ghost" className="self-center" disabled={refreshing} onClick={retry}>
          {refreshing && !loading ? 'Refreshing…' : 'Refresh Today'}
        </Button>
      )}
    </section>
  )
}
