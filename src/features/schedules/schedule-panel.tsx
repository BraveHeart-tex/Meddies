'use client'

import { Fragment, useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import type { Medicine } from '@/features/medicines/contract'
import {
  istanbulDate,
  type DailySchedule,
  type DoseOccurrence,
  type DoseOutcomeRecord,
  type Today,
} from './contract'

import { doseClock as clock } from './taken-form'
import { DoseActions } from './dose-actions'
import { scheduleToday } from './occurrences'

const field =
  'min-h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-base focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring'
const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
type Snapshot = { schedules: DailySchedule[]; records: DoseOutcomeRecord[]; today: Today | null }

export function SchedulePanel({
  medicines,
  mode = 'setup',
  initialMedicineId = '',
  medicinesLoading,
  medicinesError,
  retryMedicines,
}: {
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
  const [startDate, setStartDate] = useState(() => istanbulDate(new Date()))
  const [times, setTimes] = useState([{ key: 0, time: '', quantity: '' }])
  const [weekdays, setWeekdays] = useState([0, 1, 2, 3, 4, 5, 6])
  const rowKey = useRef(1)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [intakeMessage, setIntakeMessage] = useState('')
  const [attempted, setAttempted] = useState(false)
  const action = useRef<{ id: string; fingerprint: string } | null>(null)
  const locked = useRef(false)
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
  const selectedSchedule = schedules.find((schedule) => schedule.medicineId === medicineId)
  const available = medicines.filter(
    (medicine) => !schedules.some((schedule) => schedule.medicineId === medicine.id),
  )
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
        <section aria-labelledby="today-heading" className="space-y-4">
          <h2 id="today-heading" className="text-2xl font-semibold tracking-tight">
            Your doses
          </h2>
          <p className="text-sm text-muted-foreground">
            All dates and times use Europe/Istanbul, wherever your device is.
          </p>
          <p role="status" className="sr-only">
            {intakeMessage}
          </p>
          {(loading || (medicinesLoading && medicines.length === 0)) && (
            <p role="status">Loading your scheduled doses and medicines...</p>
          )}
          {medicinesError && (
            <div role={medicines.length === 0 ? 'alert' : 'status'} className="space-y-2">
              <p>
                {medicines.length === 0
                  ? 'Your medicines could not be loaded. Today is unavailable until they can be refreshed.'
                  : 'Medicine details could not be refreshed. Showing the last successful list.'}
              </p>
              <Button variant="outline" className="min-h-11" onClick={retryMedicines}>
                Retry loading medicines
              </Button>
            </div>
          )}
          {loadError && (
            <div role="alert" className="space-y-2">
              <p>Today could not be refreshed. Connect to the internet and retry.</p>
              <Button variant="outline" className="min-h-11" onClick={retrySchedules}>
                Retry Today
              </Button>
            </div>
          )}
          {today &&
            (!medicinesError || medicines.length > 0) &&
            (!medicinesLoading || medicines.length > 0) && (
              <>
                <p className="text-sm">{today.date}</p>
                {today.next && (
                  <p>
                    <strong>Next dose:</strong> {name(today.next.medicineId)},{' '}
                    {clock(today.next.dueAt)}
                    {istanbulDate(new Date(today.next.dueAt)) !== today.date
                      ? ` on ${istanbulDate(new Date(today.next.dueAt))}`
                      : ''}
                  </p>
                )}
                {today.doses.length ? (
                  <ul aria-label="Today's doses" className="divide-y border-y">
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
                      .map((dose, index, doses) => {
                        const group =
                          dose.status === 'Upcoming'
                            ? 'Upcoming'
                            : dose.status === 'Taken' || dose.status === 'Skipped'
                              ? 'Recorded'
                              : 'Not yet recorded'
                        const previous = doses[index - 1]
                        const previousGroup =
                          previous?.status === 'Upcoming'
                            ? 'Upcoming'
                            : previous?.status === 'Taken' || previous?.status === 'Skipped'
                              ? 'Recorded'
                              : previous
                                ? 'Not yet recorded'
                                : ''
                        const medicine = medicines.find((item) => item.id === dose.medicineId)
                        return (
                          <Fragment key={dose.id}>
                            {group !== previousGroup && (
                              <li className="bg-muted px-4 py-2 text-sm font-semibold">{group}</li>
                            )}
                            <li
                              data-dose-id={dose.id}
                              className="space-y-1 py-4 [overflow-wrap:anywhere]"
                            >
                              <h3 id={`dose-${dose.id}`} tabIndex={-1} className="font-semibold">
                                <time dateTime={dose.dueAt}>{clock(dose.dueAt)}</time> ·{' '}
                                {name(dose.medicineId)}
                              </h3>
                              <p>
                                {doseText(dose)} · {dose.status}
                              </p>
                              {dose.status === 'Taken' ? (
                                <>
                                  <p>
                                    Taken {doseText(dose, dose.record.quantity)} at{' '}
                                    <time dateTime={dose.record.takenAt}>
                                      {clock(dose.record.takenAt)}
                                    </time>
                                    {istanbulDate(new Date(dose.record.takenAt)) !== today.date
                                      ? ` on ${istanbulDate(new Date(dose.record.takenAt))}`
                                      : ''}
                                  </p>
                                </>
                              ) : dose.status === 'Skipped' ? (
                                <>
                                  <p>
                                    Skipped at{' '}
                                    <time dateTime={dose.record.recordedAt}>
                                      {clock(dose.record.recordedAt)}
                                    </time>
                                  </p>
                                </>
                              ) : null}
                              {medicine && (
                                <DoseActions
                                  dose={dose}
                                  medicine={medicine}
                                  refresh={() => reconcileOutcome(dose)}
                                  onRecorded={(record) => showOutcome(dose, record)}
                                />
                              )}
                            </li>
                          </Fragment>
                        )
                      })}
                  </ul>
                ) : (
                  <p>No doses scheduled for today.</p>
                )}
              </>
            )}
          <Button
            variant="outline"
            className="min-h-11"
            disabled={loading}
            onClick={retrySchedules}
          >
            {loadError ? 'Retry Today' : 'Refresh Today'}
          </Button>
        </section>
      )}
      {mode === 'list' && (
        <section aria-labelledby="medicine-routines-heading" className="space-y-4">
          <h2 id="medicine-routines-heading" className="text-2xl font-semibold tracking-tight">
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
            <ul className="divide-y border-y">
              {medicines.map((medicine) => {
                const schedule = schedules.find((item) => item.medicineId === medicine.id)
                return (
                  <li key={medicine.id} className="space-y-2 py-4 [overflow-wrap:anywhere]">
                    <h3 className="font-semibold">{medicine.label}</h3>
                    <p className="text-sm text-muted-foreground">
                      {medicine.strength || 'Strength not provided'} · {medicine.unit}
                    </p>
                    {schedule ? (
                      <p>
                        {(schedule.weekdays ?? [0, 1, 2, 3, 4, 5, 6]).length === 7
                          ? 'Daily'
                          : `On ${(schedule.weekdays ?? []).map((day) => WEEKDAY_NAMES[day]).join(', ')}`}{' '}
                        at{' '}
                        {schedule.times.map((slot) => `${slot.time} (${slot.quantity})`).join(', ')}{' '}
                        · Starts {schedule.startDate}
                      </p>
                    ) : (
                      <p>No schedule saved yet.</p>
                    )}
                    <a
                      className="inline-flex min-h-11 items-center underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                      href={`/medications?medicine=${encodeURIComponent(medicine.id)}`}
                    >
                      View details
                    </a>
                    {!schedule && (
                      <a
                        className="ml-4 inline-flex min-h-11 items-center underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                        href={`/medications?schedule=${encodeURIComponent(medicine.id)}#schedule-heading`}
                      >
                        Set schedule
                      </a>
                    )}
                  </li>
                )
              })}
            </ul>
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
        <section aria-labelledby="schedule-heading" className="space-y-5 [overflow-wrap:anywhere]">
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
                      <select
                        id="schedule-medicine"
                        className={field}
                        required
                        value={medicineId}
                        onChange={(event) => setMedicineId(event.target.value)}
                      >
                        <option value="">Choose a medicine</option>
                        {available.map((medicine) => (
                          <option key={medicine.id} value={medicine.id}>
                            {medicine.label} ({medicine.unit})
                          </option>
                        ))}
                      </select>
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
                    <input
                      id="schedule-start"
                      type="date"
                      required
                      min={attempted ? undefined : istanbulDate(new Date())}
                      max="2099-12-31"
                      className={field}
                      value={startDate}
                      onChange={(event) => setStartDate(event.target.value)}
                    />
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
                        <input
                          id={`dose-time-${slot.key}`}
                          type="time"
                          required
                          className={field}
                          value={slot.time}
                          onChange={(event) =>
                            setTimes((previous) =>
                              previous.map((row) =>
                                row.key === slot.key ? { ...row, time: event.target.value } : row,
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
                          className={field}
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
                          onClick={() =>
                            setTimes((previous) => previous.filter((row) => row.key !== slot.key))
                          }
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
