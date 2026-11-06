'use client'

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { MedicationTile } from '@/features/medicines/medication-tile'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Icon } from '@/components/ui/icon'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { DatePicker } from '@/components/ui/date-picker'
import { TimePicker } from '@/components/ui/time-picker'
import { Item, ItemActions, ItemContent, ItemDescription, ItemTitle } from '@/components/ui/item'
import { AppHeader } from '@/components/layout/app-header'
import type { Medicine } from '@/features/medicines/contract'
import {
  istanbulDate,
  type DailySchedule,
  type DoseOccurrence,
  type DoseOutcomeRecord,
  type Today,
} from './contract'

import { doseClock as clock } from './taken-form'
import { DoseStatusBadge } from './dose-status-badge'
import { DoseActions, type DoseDrawerOpener } from './dose-actions'
import { scheduleToday } from './occurrences'

const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
type Snapshot = { schedules: DailySchedule[]; records: DoseOutcomeRecord[]; today: Today | null }

export function SchedulePanel({
  medicines,
  mode = 'setup',
  initialMedicineId = '',
  medicinesLoading,
  medicinesError,
  retryMedicines,
  initialNow = '',
}: {
  initialNow?: string
  medicines: Medicine[]
  mode?: 'today' | 'setup' | 'list' | 'detail'
  initialMedicineId?: string
  medicinesLoading: boolean
  medicinesError: boolean
  retryMedicines: () => void
}) {
  const [{ schedules, today }, setSnapshot] = useState<Snapshot>({
    schedules: [],
    records: [],
    today: null,
  })
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [medicineId, setMedicineId] = useState(initialMedicineId)
  const [startDate, setStartDate] = useState(() =>
    istanbulDate(initialNow ? new Date(initialNow) : new Date()),
  )
  const [times, setTimes] = useState([{ key: 0, time: '', quantity: '' }])
  const [weekdays, setWeekdays] = useState([0, 1, 2, 3, 4, 5, 6])
  const rowKey = useRef(1)
  const heroOpener = useRef<DoseDrawerOpener>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [intakeMessage, setIntakeMessage] = useState('')
  const [attempted, setAttempted] = useState(false)
  const [medicineMissing, setMedicineMissing] = useState(false)
  const [startPast, setStartPast] = useState(false)
  const action = useRef<{ id: string; fingerprint: string } | null>(null)
  const locked = useRef(false)
  const medicineTrigger = useRef<HTMLButtonElement>(null)
  const mounted = useRef(false)
  const generation = useRef(0)
  const load = useCallback(async (beforeApply?: (snapshot: Snapshot) => void) => {
    const current = ++generation.current
    try {
      const response = await fetch('/api/schedules', {
        cache: 'no-store',
        signal: AbortSignal.timeout(12000),
      })
      if (!response.ok) throw new Error('load')
      const data: Snapshot = await response.json()
      if (!mounted.current || current !== generation.current) return
      beforeApply?.(data)
      setSnapshot(data)
      setLoadError(false)
    } catch {
      if (mounted.current && current === generation.current) setLoadError(true)
    } finally {
      if (mounted.current && current === generation.current) setLoading(false)
    }
  }, [])
  const retrySchedules = () => {
    setLoading(true)
    setLoadError(false)
    void load()
  }
  useEffect(() => {
    mounted.current = true
    // Network responses update state after the effect returns.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
    const refresh = () => {
      if (document.visibilityState === 'visible') void load()
    }
    const timer = setInterval(refresh, 30000)
    window.addEventListener('focus', refresh)
    return () => {
      mounted.current = false
      clearInterval(timer)
      window.removeEventListener('focus', refresh)
    }
  }, [load])
  const selected = medicines.find((medicine) => medicine.id === medicineId)
  // The server scheduling clock decides Istanbul today, not the device clock.
  const now = today?.now ?? initialNow
  const todayDate = istanbulDate(now ? new Date(now) : new Date())
  const selectedSchedule = schedules.find((schedule) => schedule.medicineId === medicineId)
  const available = medicines.filter(
    (medicine) => !schedules.some((schedule) => schedule.medicineId === medicine.id),
  )
  const medicineItems = available.map((medicine) => ({
    value: medicine.id,
    label: `${medicine.label} (${medicine.unit})`,
  }))
  const name = (id: string) => medicines.find((medicine) => medicine.id === id)?.label ?? 'Medicine'
  const doseText = (dose: DoseOccurrence, quantity = dose.quantity) => {
    const medicine = medicines.find((item) => item.id === dose.medicineId)
    return `${quantity} ${medicine?.unit ?? 'unit'}${quantity === 1 ? '' : 's'}`
  }
  function announceOutcome(dose: DoseOccurrence, record: DoseOutcomeRecord, reconciled = false) {
    const heading = document.getElementById(`dose-${dose.id}`)
    const active = document.activeElement
    if (active === document.body || heading?.parentElement?.contains(active)) heading?.focus()
    const description = `${name(dose.medicineId)} scheduled for ${clock(dose.dueAt)}`
    const outcome = record.outcome.toLowerCase()
    setIntakeMessage(
      reconciled
        ? `${description} was already recorded as ${outcome}.`
        : `Recorded ${description} as ${outcome}.`,
    )
  }

  function showOutcome(dose: DoseOccurrence, record: DoseOutcomeRecord) {
    if (!mounted.current) return
    ++generation.current
    announceOutcome(dose, record)
    setSnapshot((current) => {
      const records = [
        ...current.records.filter(
          (item) => item.scheduleId !== record.scheduleId || item.dueAt !== record.dueAt,
        ),
        record,
      ]
      return {
        ...current,
        records,
        today: current.today
          ? scheduleToday(current.schedules, new Date(current.today.now), records)
          : null,
      }
    })
    void load()
  }

  async function reconcileOutcome(dose: DoseOccurrence) {
    let resolved = false
    await load((snapshot) => {
      const record = snapshot.records.find(
        (item) => item.scheduleId === dose.scheduleId && item.dueAt === dose.dueAt,
      )
      if (!record) return
      announceOutcome(dose, record, true)
      resolved = true
    })
    return resolved
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (locked.current) return
    if (!medicineId) {
      setMedicineMissing(true)
      medicineTrigger.current?.focus()
      return
    }
    if (!attempted && startDate < todayDate) {
      setStartPast(true)
      document.getElementById('schedule-start')?.focus()
      return
    }
    if (weekdays.length === 0) {
      setAttempted(true)
      return
    }
    locked.current = true
    setAttempted(true)
    setSaving(true)
    setError('')
    setMessage('')
    const details = {
      medicineId,
      startDate,
      times: times.map((slot) => ({ time: slot.time, quantity: Number(slot.quantity) })),
      weekdays,
    }
    details.weekdays = [...details.weekdays].sort((a, b) => a - b)
    const fingerprint = JSON.stringify(details)
    if (action.current?.fingerprint !== fingerprint)
      action.current = { id: crypto.randomUUID(), fingerprint }
    try {
      const response = await fetch('/api/schedules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...details, id: action.current.id }),
        signal: AbortSignal.timeout(12000),
      })
      if (!response.ok) {
        throw new Error(
          response.status === 400
            ? 'Check the start date, selected weekdays, unique times and quantities. Use whole or half tablets, or whole capsules.'
            : response.status === 401
              ? 'Your session ended. Sign in again to save your schedule.'
              : response.status === 409
                ? 'A schedule is already saved for this medicine. Refresh Today to see it.'
                : 'Save could not be confirmed. Keep these details, connect to the internet and retry.',
        )
      }
      const data = await response.json()
      if (!mounted.current) return
      ++generation.current
      const schedule: DailySchedule = data.schedules[0]
      setSnapshot((current) => ({
        ...current,
        schedules: [...current.schedules.filter((item) => item.id !== schedule.id), schedule],
      }))
      action.current = null
      setAttempted(false)
      setTimes([{ key: rowKey.current++, time: '', quantity: '' }])
      setWeekdays([0, 1, 2, 3, 4, 5, 6])
      setMessage('Schedule saved.')
      await load()
    } catch (failure) {
      if (mounted.current)
        setError(
          failure instanceof Error && failure.name === 'Error'
            ? failure.message
            : 'Save could not be confirmed. Your details are still here. Connect and retry.',
        )
    } finally {
      locked.current = false
      if (mounted.current) setSaving(false)
    }
  }
  return (
    <div className="space-y-10">
      {mode === 'today' && (
        <div className="flex flex-col gap-5">
          <AppHeader
            eyebrow={formatDayLabel(today?.now ?? initialNow)}
            title={greeting(today?.now ?? initialNow)}
          />
          <section aria-labelledby="today-heading" className="flex flex-col gap-5">
            <h2 id="today-heading" className="sr-only">
              Your doses
            </h2>
            <div role="status" className="empty:sr-only">
              {intakeMessage && (
                <Alert role="none" variant="confirmation" className="[overflow-wrap:anywhere]">
                  <span className="grid size-6.5 place-items-center rounded-full bg-dose-taken text-dose-taken-foreground">
                    <Icon name="check" size={14} strokeWidth={2.4} />
                  </span>
                  <AlertDescription className="font-bold">{intakeMessage}</AlertDescription>
                </Alert>
              )}
            </div>
            {(loading || (medicinesLoading && medicines.length === 0)) && (
              <p role="status" className="text-body-sm text-muted-foreground">
                Loading your scheduled doses and medicines...
              </p>
            )}
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
            {loadError && (
              <Alert>
                <AlertDescription className="flex flex-col items-start gap-2 text-foreground">
                  <p>Today could not be refreshed. Connect to the internet and retry.</p>
                  <Button variant="outline" onClick={retrySchedules}>
                    Retry Today
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
                    <section
                      aria-labelledby="today-doses-heading"
                      className="flex flex-col gap-3.5"
                    >
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
                                    {[medicine?.strength, doseText(dose)]
                                      .filter(Boolean)
                                      .join(' · ')}
                                    {dose.status === 'Taken' &&
                                      dose.record.quantity !== dose.quantity &&
                                      ` · took ${doseText(dose, dose.record.quantity)}`}
                                    {recordedAt &&
                                      istanbulDate(new Date(recordedAt)) !== today.date &&
                                      ` · ${dose.status === 'Taken' ? 'taken' : 'skipped'} on ${istanbulDate(new Date(recordedAt))}`}
                                  </ItemDescription>
                                </ItemContent>
                                <DoseStatusBadge
                                  id={`dose-status-${dose.id}`}
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
                                    referenceNow={today.now}
                                    describedBy={`dose-status-${dose.id}`}
                                    opener={dose.id === today.next?.id ? heroOpener : undefined}
                                    refresh={() => reconcileOutcome(dose)}
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
            {!loadError && (
              <Button
                variant="ghost"
                className="self-center"
                disabled={loading}
                onClick={retrySchedules}
              >
                Refresh Today
              </Button>
            )}
          </section>
        </div>
      )}
      {mode === 'list' && (
        <section aria-labelledby="medicine-routines-heading" className="flex flex-col gap-4">
          <h2 id="medicine-routines-heading" className="sr-only">
            Your medicines
          </h2>
          {loading || medicinesLoading ? (
            <p role="status">Loading saved routines...</p>
          ) : medicinesError ? (
            <div role={medicines.length === 0 ? 'alert' : 'status'} className="space-y-2">
              <p>Your medicines could not be refreshed.</p>
              <Button variant="outline" className="min-h-11" onClick={retryMedicines}>
                Retry loading medicines
              </Button>
            </div>
          ) : loadError ? (
            <div role="alert" className="space-y-2">
              <p>Saved routines could not be loaded.</p>
              <Button variant="outline" className="min-h-11" onClick={retrySchedules}>
                Retry loading routines
              </Button>
            </div>
          ) : medicines.length === 0 ? (
            <p>No medicines saved yet.</p>
          ) : (
            <MedicationRoutineGroups medicines={medicines} schedules={schedules} />
          )}
        </section>
      )}
      {mode === 'detail' && (
        <section aria-labelledby="routine-heading" className="space-y-3 [overflow-wrap:anywhere]">
          <h2 id="routine-heading" className="text-xl font-semibold">
            Saved routine
          </h2>
          {loading || medicinesLoading ? (
            <p role="status">Loading saved routine...</p>
          ) : medicinesError ? (
            <div role="alert" className="space-y-2">
              <p>The medicine could not be loaded.</p>
              <Button variant="outline" className="min-h-11" onClick={retryMedicines}>
                Retry loading medicine
              </Button>
            </div>
          ) : loadError ? (
            <div role="alert" className="space-y-2">
              <p>The saved routine could not be loaded.</p>
              <Button variant="outline" className="min-h-11" onClick={retrySchedules}>
                Retry loading routine
              </Button>
            </div>
          ) : selectedSchedule ? (
            <div className="space-y-2 rounded-xl border bg-card p-4">
              <p>
                {(selectedSchedule.weekdays ?? [0, 1, 2, 3, 4, 5, 6]).length === 7
                  ? 'Daily'
                  : `On ${(selectedSchedule.weekdays ?? []).map((day) => WEEKDAY_NAMES[day]).join(', ')}`}{' '}
                at{' '}
                {selectedSchedule.times.map((slot) => `${slot.time} (${slot.quantity})`).join(', ')}
              </p>
              <p className="text-sm text-muted-foreground">Starts {selectedSchedule.startDate}.</p>
            </div>
          ) : medicines.some((item) => item.id === initialMedicineId) ? (
            <div className="space-y-2">
              <p>No schedule saved yet.</p>
              <a
                className="inline-flex min-h-11 items-center rounded-md bg-primary px-4 text-primary-foreground"
                href={`/medications?schedule=${encodeURIComponent(initialMedicineId)}#schedule-heading`}
              >
                Set schedule
              </a>
            </div>
          ) : (
            <p role="alert">This medicine could not be found.</p>
          )}
        </section>
      )}
      {mode === 'setup' && (
        <section
          aria-labelledby="schedule-heading"
          className="space-y-5 rounded-2xl border bg-card p-4 [overflow-wrap:anywhere]"
        >
          <h2 id="schedule-heading" className="text-xl font-semibold">
            Set dose schedule
          </h2>
          <p className="text-sm text-muted-foreground">
            Save online. Starts at the next configured time after confirmation. Earlier times today
            are not added.
          </p>
          {loading || medicinesLoading ? (
            <p role="status">Loading medicines and saved routines...</p>
          ) : medicinesError ? (
            <div role="alert" className="space-y-2">
              <p>The medicine list could not be loaded.</p>
              <Button variant="outline" className="min-h-11" onClick={retryMedicines}>
                Retry loading medicines
              </Button>
            </div>
          ) : loadError ? (
            <div role="alert" className="space-y-2">
              <p>Saved routines could not be checked.</p>
              <Button variant="outline" className="min-h-11" onClick={retrySchedules}>
                Retry loading routines
              </Button>
            </div>
          ) : initialMedicineId &&
            !medicines.some((medicine) => medicine.id === initialMedicineId) ? (
            <div role="alert" className="space-y-2">
              <p>This medicine could not be found. Choose a saved medicine to set up a schedule.</p>
              <a className="inline-flex min-h-11 items-center underline" href="/medications">
                Back to medications
              </a>
            </div>
          ) : mode === 'setup' && initialMedicineId && selectedSchedule ? (
            <div className="space-y-2 rounded-xl border bg-card p-4">
              <p className="font-medium">Saved routine for {name(initialMedicineId)}</p>
              <p>
                {(selectedSchedule.weekdays ?? [0, 1, 2, 3, 4, 5, 6]).length === 7
                  ? 'Daily'
                  : `On ${(selectedSchedule.weekdays ?? []).map((day) => WEEKDAY_NAMES[day]).join(', ')}`}{' '}
                at{' '}
                {selectedSchedule.times.map((slot) => `${slot.time} (${slot.quantity})`).join(', ')}
              </p>
              <p className="text-sm text-muted-foreground">
                Starts {selectedSchedule.startDate}. Schedule changes are not available here.
              </p>
            </div>
          ) : medicines.length === 0 ? (
            <p>Add a medicine below to set its schedule.</p>
          ) : !loading && !loadError && available.length === 0 ? (
            <p>Your medicines already have schedules.</p>
          ) : (
            <>
              {mode === 'setup' && initialMedicineId && !loadError && (
                <p role="status">No schedule saved for {name(initialMedicineId)} yet.</p>
              )}
              <form onSubmit={save} aria-busy={saving} className="space-y-5">
                <fieldset
                  disabled={saving || loading || loadError}
                  className="space-y-5 disabled:opacity-70"
                  aria-describedby={error ? 'schedule-error' : undefined}
                >
                  <legend className="sr-only">Dose schedule details</legend>
                  {initialMedicineId ? (
                    <p className="font-medium">Medicine: {name(initialMedicineId)}</p>
                  ) : (
                    <div className="space-y-2">
                      <label htmlFor="schedule-medicine" className="block font-medium">
                        Medicine
                      </label>
                      <Select
                        id="schedule-medicine"
                        items={medicineItems}
                        value={medicineId || null}
                        onValueChange={(value) => {
                          setMedicineId(value ?? '')
                          if (value) setMedicineMissing(false)
                        }}
                        disabled={saving || loading || loadError}
                      >
                        <SelectTrigger
                          ref={medicineTrigger}
                          aria-required
                          aria-invalid={medicineMissing}
                          aria-describedby={medicineMissing ? 'schedule-medicine-error' : undefined}
                        >
                          <SelectValue placeholder="Choose a medicine" />
                        </SelectTrigger>
                        <SelectContent>
                          {medicineItems.map((item) => (
                            <SelectItem key={item.value} value={item.value}>
                              {item.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {medicineMissing && (
                        <p id="schedule-medicine-error" role="alert">
                          Choose a medicine.
                        </p>
                      )}
                    </div>
                  )}
                  <fieldset
                    id="schedule-weekdays"
                    aria-describedby={
                      attempted && weekdays.length === 0 ? 'weekdays-error' : undefined
                    }
                    className="space-y-2"
                  >
                    <legend className="font-medium">Repeat on</legend>
                    <div className="flex flex-wrap gap-3">
                      {WEEKDAY_NAMES.map((day, index) => (
                        <label key={day} className="flex min-h-11 items-center gap-2">
                          <input
                            id={`schedule-weekday-${index}`}
                            type="checkbox"
                            checked={weekdays.includes(index)}
                            aria-invalid={attempted && weekdays.length === 0}
                            onChange={() =>
                              setWeekdays((value) =>
                                value.includes(index)
                                  ? value.filter((item) => item !== index)
                                  : [...value, index],
                              )
                            }
                          />
                          {day}
                        </label>
                      ))}
                    </div>
                    {attempted && weekdays.length === 0 && (
                      <p id="weekdays-error" role="alert">
                        Choose at least one weekday.
                      </p>
                    )}
                  </fieldset>
                  <div className="space-y-2">
                    <label htmlFor="schedule-start" className="block font-medium">
                      Start date in Istanbul
                    </label>
                    <DatePicker
                      id="schedule-start"
                      label="Start date in Istanbul"
                      today={todayDate}
                      min={attempted ? undefined : todayDate}
                      max="2099-12-31"
                      disabled={saving || loading || loadError}
                      aria-invalid={startPast}
                      aria-describedby={startPast ? 'schedule-start-error' : undefined}
                      value={startDate}
                      onValueChange={(value) => {
                        setStartDate(value)
                        setStartPast(false)
                      }}
                    />
                    {startPast && (
                      <p id="schedule-start-error" role="alert">
                        Choose today or a later date.
                      </p>
                    )}
                  </div>
                  <p id="quantity-help" className="text-sm text-muted-foreground">
                    Quantity taken per dose, separate from product strength. Whole or half tablets;
                    whole capsules.
                  </p>
                  {times.map((slot, index) => (
                    <div key={slot.key} className="space-y-3 border-t pt-4">
                      <div className="space-y-2">
                        <label htmlFor={`dose-time-${slot.key}`} className="block font-medium">
                          Time {index + 1}
                        </label>
                        <TimePicker
                          id={`dose-time-${slot.key}`}
                          label={`Time ${index + 1}`}
                          required
                          disabled={saving || loading || loadError}
                          value={slot.time}
                          onValueChange={(time) =>
                            setTimes((previous) =>
                              previous.map((row) =>
                                row.key === slot.key ? { ...row, time } : row,
                              ),
                            )
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <label htmlFor={`dose-quantity-${slot.key}`} className="block font-medium">
                          Quantity {selected ? `(${selected.unit}s)` : ''}
                        </label>
                        <input
                          id={`dose-quantity-${slot.key}`}
                          type="number"
                          inputMode="decimal"
                          required
                          min={selected?.unit === 'capsule' ? 1 : 0.5}
                          step={selected?.unit === 'capsule' ? 1 : 0.5}
                          aria-describedby="quantity-help"
                          className="meddies-field"
                          value={slot.quantity}
                          onChange={(event) =>
                            setTimes((previous) =>
                              previous.map((row) =>
                                row.key === slot.key
                                  ? { ...row, quantity: event.target.value }
                                  : row,
                              ),
                            )
                          }
                        />
                      </div>
                      {times.length > 1 && (
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => {
                            const adjacent = times[index + 1] ?? times[index - 1]
                            document.getElementById(`dose-quantity-${adjacent.key}`)?.focus()
                            setTimes((previous) => previous.filter((row) => row.key !== slot.key))
                          }}
                        >
                          Remove time {index + 1}
                        </Button>
                      )}
                    </div>
                  ))}
                  {times.length < 24 && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() =>
                        setTimes((previous) => [
                          ...previous,
                          { key: rowKey.current++, time: '', quantity: '' },
                        ])
                      }
                    >
                      Add time
                    </Button>
                  )}
                </fieldset>
                {error && (
                  <p id="schedule-error" role="alert">
                    {error}
                  </p>
                )}
                <Button
                  type="submit"
                  className="min-h-11 w-full whitespace-normal"
                  disabled={saving || loading || loadError}
                  aria-describedby={error ? 'schedule-error' : undefined}
                >
                  {saving
                    ? 'Saving schedule...'
                    : error
                      ? 'Retry saving schedule'
                      : 'Save schedule'}
                </Button>
              </form>
            </>
          )}
          <p role="status" className="text-sm">
            {message}
          </p>
        </section>
      )}
    </div>
  )
}

const SHORT_WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function routineSummary(schedule: DailySchedule) {
  const days = schedule.weekdays ?? [0, 1, 2, 3, 4, 5, 6]
  return [
    days.length === 7 ? 'Every day' : days.map((day) => SHORT_WEEKDAYS[day]).join(', '),
    schedule.times.map((slot) => slot.time).join(', '),
  ].join(' · ')
}

function MedicationRoutineGroups({
  medicines,
  schedules,
}: {
  medicines: Medicine[]
  schedules: DailySchedule[]
}) {
  const routines = medicines.map((medicine) => ({
    medicine,
    schedule: schedules.find((item) => item.medicineId === medicine.id),
  }))
  const routineGroups = [
    { label: 'On a schedule', entries: routines.filter(({ schedule }) => schedule) },
    { label: 'No schedule', entries: routines.filter(({ schedule }) => !schedule) },
  ]

  return routineGroups.map(
    ({ label, entries }) =>
      entries.length > 0 && (
        <section key={label} aria-label={label} className="flex flex-col gap-2.5">
          <h3 className="px-1 pt-1 text-label leading-none font-extrabold tracking-eyebrow text-muted-foreground uppercase">
            {label}
          </h3>
          <ul className="flex flex-col gap-2.5">
            {entries.map(({ medicine, schedule }) => (
              <Item
                key={medicine.id}
                render={<li />}
                variant={schedule ? 'card' : 'dashed'}
                className="p-3.5 has-[[data-row-link]:active]:scale-[0.98] has-[[data-row-link]:active]:bg-muted motion-reduce:has-[[data-row-link]:active]:scale-100"
              >
                <MedicationTile medicineId={medicine.id} />
                <ItemContent className="gap-0.75">
                  <ItemTitle>
                    <h4>{medicine.label}</h4>
                  </ItemTitle>
                  <ItemDescription>
                    {[medicine.strength, medicine.unit].filter(Boolean).join(' · ')}
                  </ItemDescription>
                  {schedule ? (
                    <p className="text-label font-bold">{routineSummary(schedule)}</p>
                  ) : (
                    <p className="text-label font-semibold text-muted-foreground">
                      No schedule saved yet.
                    </p>
                  )}
                </ItemContent>
                <a
                  data-row-link
                  className="absolute inset-0 rounded-[inherit] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                  href={`/medications?medicine=${encodeURIComponent(medicine.id)}`}
                  aria-label={`View details for ${medicine.label}`}
                >
                  <span className="sr-only">View details</span>
                </a>
                {!schedule && (
                  <ItemActions className="relative">
                    <Button
                      variant="soft"
                      size="sm"
                      nativeButton={false}
                      render={
                        <a
                          href={`/medications?schedule=${encodeURIComponent(medicine.id)}#schedule-heading`}
                          aria-label={`Add schedule for ${medicine.label}`}
                        />
                      }
                    >
                      Add schedule
                    </Button>
                  </ItemActions>
                )}
              </Item>
            ))}
          </ul>
        </section>
      ),
  )
}

function formatDayLabel(instant: string) {
  if (!instant) return undefined
  const part = (options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Istanbul', ...options }).format(
      new Date(instant),
    )
  return `${part({ weekday: 'long' })}, ${part({ day: 'numeric', month: 'long' })}`
}

function greeting(instant: string) {
  if (!instant) return 'Today'
  const hour = Number(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Istanbul',
      hour: '2-digit',
      hourCycle: 'h23',
    }).format(new Date(instant)),
  )
  return hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'
}

function NextDose({
  dose,
  date,
  medicine,
  name,
  doseText,
  onRecord,
}: {
  dose: DoseOccurrence
  date: string
  medicine?: Medicine
  name: string
  doseText: string
  onRecord?: (outcome: 'Taken' | 'Skipped') => void
}) {
  const dueDate = istanbulDate(new Date(dose.dueAt))
  return (
    <Card variant="accent" className="gap-4 [overflow-wrap:break-word]">
      <CardHeader className="flex flex-wrap items-center justify-between gap-2">
        <CardTitle className="text-label leading-none tracking-eyebrow text-accent-foreground uppercase">
          <h3>Up next</h3>
        </CardTitle>
        <CardAction className="col-auto row-auto self-center justify-self-auto">
          <DoseStatusBadge status={dose.status} />
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center gap-3.5">
        <MedicationTile medicineId={dose.medicineId} size="lg" onAccent />
        <div className="flex min-w-[min(100%,8rem)] flex-1 flex-col gap-0.75">
          <p className="text-title font-extrabold">{name}</p>
          <p className="text-body-sm text-secondary-foreground">
            {[medicine?.strength, doseText].filter(Boolean).join(' · ')} · due{' '}
            <time dateTime={dose.dueAt}>{clock(dose.dueAt)}</time>
            {dueDate !== date ? ` on ${dueDate}` : ''}
          </p>
        </div>
      </CardContent>
      {onRecord && (
        <CardContent className="flex flex-wrap gap-2.5">
          <Button
            size="lg"
            className="min-w-[min(100%,7rem)] flex-1"
            aria-label={`Record ${name} at ${clock(dose.dueAt)} as taken`}
            onClick={() => onRecord('Taken')}
          >
            <Icon name="check" data-icon="inline-start" />
            Taken
          </Button>
          <Button
            size="lg"
            variant="outline"
            className="w-28 max-w-full border-transparent"
            aria-label={`Record ${name} at ${clock(dose.dueAt)} as skipped`}
            onClick={() => onRecord('Skipped')}
          >
            Skip
          </Button>
        </CardContent>
      )}
    </Card>
  )
}
