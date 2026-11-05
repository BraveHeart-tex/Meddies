'use client'

import { useId, useRef, useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import type { Medicine } from '@/features/medicines/contract'
import { istanbulDate, SCHEDULE_TIMEZONE, type DoseOccurrence, type DoseRecord } from './contract'

const field =
  'min-h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-base focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring'

export const doseClock = (instant: string) =>
  new Intl.DateTimeFormat('en-GB', {
    timeZone: SCHEDULE_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(instant))

export function TakenForm({
  dose,
  medicine,
  refresh,
  onRecorded,
}: {
  dose: DoseOccurrence
  medicine: Medicine
  refresh: () => Promise<void>
  onRecorded: (record: DoseRecord) => void
}) {
  const id = useId()
  const [open, setOpen] = useState(false)
  const [takenAt, setTakenAt] = useState('')
  const [quantity, setQuantity] = useState(String(dose.quantity))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const locked = useRef(false)
  const step = medicine.unit === 'capsule' ? 1 : 0.5

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (locked.current) return
    locked.current = true
    setSaving(true)
    setError('')
    try {
      const response = await fetch('/api/schedules', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(12000),
        body: JSON.stringify({
          scheduleId: dose.scheduleId,
          dueAt: dose.dueAt,
          takenAt: new Date(`${takenAt}+03:00`).toJSON(),
          quantity: Number(quantity),
        }),
      })
      if (response.status === 400) {
        setError('Check the quantity and enter a time that has already passed.')
      } else if (response.status === 401) {
        setError('Your session ended. Sign in again to record this dose.')
      } else if (response.status === 409) {
        setError('This dose already has a different intake record.')
        await refresh()
      } else if (response.ok) {
        const { record } = (await response.json()) as { record: DoseRecord }
        onRecorded(record)
        await refresh()
      } else {
        setError('Save could not be confirmed. Connect and retry with the same details.')
      }
    } catch {
      setError('Save could not be confirmed. Connect and retry with the same details.')
    } finally {
      locked.current = false
      setSaving(false)
    }
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        className="min-h-11"
        aria-expanded={open}
        aria-controls={id}
        aria-label={`Mark ${medicine.label} at ${doseClock(dose.dueAt)} as taken`}
        disabled={saving}
        onClick={() => {
          if (!takenAt) {
            const now = new Date()
            setTakenAt(`${istanbulDate(now)}T${doseClock(now.toISOString())}`)
          }
          setOpen(!open)
        }}
      >
        Mark as taken
      </Button>
      <form id={id} hidden={!open} onSubmit={save} aria-busy={saving}>
        <fieldset
          disabled={saving}
          aria-describedby={error ? `${id}-error` : undefined}
          className="space-y-3 pt-3"
        >
          <legend className="sr-only">Actual intake for {medicine.label}</legend>
          <div>
            <label htmlFor={`${id}-time`}>Taken date and time in Istanbul</label>
            <input
              id={`${id}-time`}
              className={field}
              type="datetime-local"
              required
              value={takenAt}
              onChange={(event) => setTakenAt(event.target.value)}
            />
          </div>
          <div>
            <label htmlFor={`${id}-quantity`}>Quantity taken ({medicine.unit}s)</label>
            <input
              id={`${id}-quantity`}
              className={field}
              type="number"
              inputMode="decimal"
              required
              min={step}
              step={step}
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
            />
          </div>
          <Button type="submit" className="min-h-11">
            {saving ? 'Saving intake...' : 'Save taken dose'}
          </Button>
        </fieldset>
        {error && (
          <p id={`${id}-error`} role="alert">
            {error}
          </p>
        )}
      </form>
    </>
  )
}
