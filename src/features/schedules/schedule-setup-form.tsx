'use client'

import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { DatePicker } from '@/components/ui/date-picker'
import { TimePicker } from '@/components/ui/time-picker'
import type { Medicine } from '@/features/medicines/contract'
import { istanbulDate, type DailySchedule } from './contract'
import { ScheduleMedicineSelect } from './schedule-medicine-select'
import type { ScheduleSnapshot } from './use-schedule-snapshot'

export const WEEKDAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
]

export function ScheduleSetupForm({
  snapshot: { schedules, now, loading, loadError, retry: retrySchedules, insertSchedule },
  initialNow,
  initialMedicineId,
  medicineId,
  onMedicineChange: setMedicineId,
  name,
  medicines,
  medicinesLoading,
  medicinesError,
  retryMedicines,
}: {
  snapshot: ScheduleSnapshot
  initialNow: string
  initialMedicineId: string
  medicineId: string
  onMedicineChange: (medicineId: string) => void
  name: (id: string) => string
  medicines: Medicine[]
  medicinesLoading: boolean
  medicinesError: boolean
  retryMedicines: () => void
}) {
  const [startDate, setStartDate] = useState(() => istanbulDate(new Date(initialNow)))
  const [times, setTimes] = useState([{ key: 0, time: '', quantity: '' }])
  const [weekdays, setWeekdays] = useState([0, 1, 2, 3, 4, 5, 6])
  const rowKey = useRef(1)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [attempted, setAttempted] = useState(false)
  const [medicineMissing, setMedicineMissing] = useState(false)
  const [startPast, setStartPast] = useState(false)
  const action = useRef<{ id: string; fingerprint: string } | null>(null)
  const locked = useRef(false)
  const medicineTrigger = useRef<HTMLButtonElement>(null)
  const mounted = useRef(false)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  const selected = medicines.find((medicine) => medicine.id === medicineId)
  const todayDate = istanbulDate(new Date(now))
  const selectedSchedule = schedules.find((schedule) => schedule.medicineId === medicineId)
  const available = medicines.filter(
    (medicine) => !schedules.some((schedule) => schedule.medicineId === medicine.id),
  )

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
      const schedule: DailySchedule = data.schedules[0]
      const reloaded = insertSchedule(schedule)
      if (!reloaded) return
      action.current = null
      setAttempted(false)
      setTimes([{ key: rowKey.current++, time: '', quantity: '' }])
      setWeekdays([0, 1, 2, 3, 4, 5, 6])
      setMessage('Schedule saved.')
      await reloaded
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
    <section
      aria-labelledby="schedule-heading"
      className="space-y-5 rounded-2xl border bg-card p-4 [overflow-wrap:anywhere]"
    >
      <h2 id="schedule-heading" className="text-xl font-semibold">
        Set dose schedule
      </h2>
      <p className="text-sm text-muted-foreground">
        Save online. Starts at the next configured time after confirmation. Earlier times today are
        not added.
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
      ) : initialMedicineId && !medicines.some((medicine) => medicine.id === initialMedicineId) ? (
        <div role="alert" className="space-y-2">
          <p>This medicine could not be found. Choose a saved medicine to set up a schedule.</p>
          <a className="inline-flex min-h-11 items-center underline" href="/medications">
            Back to medications
          </a>
        </div>
      ) : initialMedicineId && selectedSchedule ? (
        <div className="space-y-2 rounded-xl border bg-card p-4">
          <p className="font-medium">Saved routine for {name(initialMedicineId)}</p>
          <p>
            {(selectedSchedule.weekdays ?? [0, 1, 2, 3, 4, 5, 6]).length === 7
              ? 'Daily'
              : `On ${(selectedSchedule.weekdays ?? []).map((day) => WEEKDAY_NAMES[day]).join(', ')}`}{' '}
            at {selectedSchedule.times.map((slot) => `${slot.time} (${slot.quantity})`).join(', ')}
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
          {initialMedicineId && !loadError && (
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
                <ScheduleMedicineSelect
                  medicines={available}
                  value={medicineId}
                  onValueChange={(value) => {
                    setMedicineId(value ?? '')
                    if (value) setMedicineMissing(false)
                  }}
                  disabled={saving || loading || loadError}
                  missing={medicineMissing}
                  triggerRef={medicineTrigger}
                />
              )}
              <fieldset
                id="schedule-weekdays"
                aria-describedby={attempted && weekdays.length === 0 ? 'weekdays-error' : undefined}
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
                          previous.map((row) => (row.key === slot.key ? { ...row, time } : row)),
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
              {saving ? 'Saving schedule...' : error ? 'Retry saving schedule' : 'Save schedule'}
            </Button>
          </form>
        </>
      )}
      <p role="status" className="text-sm">
        {message}
      </p>
    </section>
  )
}
