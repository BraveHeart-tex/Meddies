'use client'

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
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
type Snapshot = { schedules: DailySchedule[]; records: DoseOutcomeRecord[]; today: Today | null }

export function SchedulePanel({ medicines }: { medicines: Medicine[] }) {
  const [{ schedules, today }, setSnapshot] = useState<Snapshot>({
    schedules: [],
    records: [],
    today: null,
  })
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [medicineId, setMedicineId] = useState('')
  const [startDate, setStartDate] = useState(() => istanbulDate(new Date()))
  const [times, setTimes] = useState([{ key: 0, time: '', quantity: '' }])
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
    locked.current = true
    setAttempted(true)
    setSaving(true)
    setError('')
    setMessage('')
    const details = {
      medicineId,
      startDate,
      times: times.map((slot) => ({ time: slot.time, quantity: Number(slot.quantity) })),
    }
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
            ? 'Check the start date, unique daily times and quantities. Use whole or half tablets, or whole capsules.'
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
      setMedicineId('')
      setTimes([{ key: rowKey.current++, time: '', quantity: '' }])
      setMessage('Daily schedule saved.')
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
      <section aria-labelledby="today-heading" className="space-y-4">
        <h2 id="today-heading" className="text-2xl font-semibold tracking-tight">
          Today
        </h2>
        <p className="text-sm text-muted-foreground">
          All dates and times use Europe/Istanbul, wherever your device is.
        </p>
        <p role="status" className="sr-only">
          {intakeMessage}
        </p>
        {loading && <p role="status">Loading your daily doses...</p>}
        {loadError && (
          <p role="alert">Today could not be refreshed. Connect to the internet and retry.</p>
        )}
        {today && (
          <>
            <p className="text-sm">{today.date}</p>
            {today.next && (
              <p>
                <strong>Next dose:</strong> {name(today.next.medicineId)}, {clock(today.next.dueAt)}
                {istanbulDate(new Date(today.next.dueAt)) !== today.date
                  ? ` on ${istanbulDate(new Date(today.next.dueAt))}`
                  : ''}
              </p>
            )}
            {today.doses.length ? (
              <ul className="divide-y border-y">
                {today.doses.map((dose) => {
                  const medicine = medicines.find((item) => item.id === dose.medicineId)
                  return (
                    <li key={dose.id} className="space-y-1 py-4 [overflow-wrap:anywhere]">
                      <h3 id={`dose-${dose.id}`} tabIndex={-1} className="font-semibold">
                        <time dateTime={dose.dueAt}>{clock(dose.dueAt)}</time> ·{' '}
                        {name(dose.medicineId)}
                      </h3>
                      <p>
                        {doseText(dose)} · {dose.status}
                      </p>
                      {dose.status === 'Taken' ? (
                        <p>
                          Taken {doseText(dose, dose.record.quantity)} at{' '}
                          <time dateTime={dose.record.takenAt}>{clock(dose.record.takenAt)}</time>
                          {istanbulDate(new Date(dose.record.takenAt)) !== today.date
                            ? ` on ${istanbulDate(new Date(dose.record.takenAt))}`
                            : ''}
                        </p>
                      ) : dose.status === 'Skipped' ? (
                        <p>
                          Skipped at{' '}
                          <time dateTime={dose.record.recordedAt}>
                            {clock(dose.record.recordedAt)}
                          </time>
                        </p>
                      ) : (
                        medicine && (
                          <DoseActions
                            dose={dose}
                            medicine={medicine}
                            refresh={() => reconcileOutcome(dose)}
                            onRecorded={(record) => showOutcome(dose, record)}
                          />
                        )
                      )}
                    </li>
                  )
                })}
              </ul>
            ) : (
              <p>No daily doses scheduled for today.</p>
            )}
          </>
        )}
        <Button
          variant="outline"
          className="min-h-11"
          disabled={loading}
          onClick={() => {
            setLoading(true)
            void load()
          }}
        >
          Refresh Today
        </Button>
      </section>
      {schedules.length > 0 && (
        <section aria-labelledby="daily-heading" className="space-y-3">
          <h2 id="daily-heading" className="text-xl font-semibold">
            Daily schedules
          </h2>
          <ul className="space-y-4">
            {schedules.map((schedule) => (
              <li key={schedule.id} className="[overflow-wrap:anywhere]">
                <h3 className="font-semibold">{name(schedule.medicineId)}</h3>
                <p>
                  Daily at{' '}
                  {schedule.times.map((slot) => `${slot.time} (${slot.quantity})`).join(', ')} ·
                  Starts {schedule.startDate}
                </p>
                <p className="text-sm text-muted-foreground">
                  Quantities in{' '}
                  {medicines.find((item) => item.id === schedule.medicineId)?.unit ?? 'unit'}s.
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}
      <section aria-labelledby="schedule-heading" className="space-y-5">
        <h2 id="schedule-heading" className="text-xl font-semibold">
          Set daily doses
        </h2>
        <p className="text-sm text-muted-foreground">
          Save online. Starts at the next configured time after confirmation. Earlier times today
          are not added.
        </p>
        {medicines.length === 0 ? (
          <p>Add a medicine below to set its daily doses.</p>
        ) : !loading && !loadError && available.length === 0 ? (
          <p>Your medicines already have daily schedules.</p>
        ) : (
          <form onSubmit={save} aria-busy={saving} className="space-y-5">
            <fieldset
              disabled={saving || loading || loadError}
              className="space-y-5 disabled:opacity-70"
              aria-describedby={error ? 'schedule-error' : undefined}
            >
              <legend className="sr-only">Daily dose details</legend>
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
                      Daily time {index + 1}
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
                            row.key === slot.key ? { ...row, quantity: event.target.value } : row,
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
                  Add daily time
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
                  : 'Save daily schedule'}
            </Button>
          </form>
        )}
        <p role="status" className="text-sm">
          {message}
        </p>
      </section>
    </div>
  )
}
