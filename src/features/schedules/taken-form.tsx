'use client'

import { useId, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { Button } from '@/components/ui/button'
import type { Medicine } from '@/features/medicines/contract'
import {
  istanbulDate,
  SCHEDULE_TIMEZONE,
  type DoseOccurrence,
  type TakenDoseInput,
} from './contract'

export const doseClock = (instant: string) =>
  new Intl.DateTimeFormat('en-GB', {
    timeZone: SCHEDULE_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(instant))

export function TakenForm({
  dose,
  medicine,
  open,
  blocked,
  saving,
  error,
  onOpen,
  onSubmit,
  editing = false,
}: {
  dose: DoseOccurrence
  medicine: Medicine
  open: boolean
  blocked: boolean
  saving: boolean
  error: string
  onOpen: (open: boolean) => void
  onSubmit: (details: { takenAt: TakenDoseInput['takenAt'] | null; quantity: number }) => void
  editing?: boolean
}) {
  const id = useId()
  const trigger = useRef<HTMLButtonElement>(null)
  const [takenAt, setTakenAt] = useState('')
  const [quantity, setQuantity] = useState(
    String(dose.status === 'Taken' ? dose.record.quantity : dose.quantity),
  )
  const step = medicine.unit === 'capsule' ? 1 : 0.5

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    onSubmit({
      takenAt:
        takenAt === originalLocalTime && dose.status === 'Taken'
          ? dose.record.takenAt
          : new Date(`${takenAt}+03:00`).toJSON(),
      quantity: Number(quantity),
    })
  }

  const originalLocalTime =
    dose.status === 'Taken'
      ? `${istanbulDate(new Date(dose.record.takenAt))}T${doseClock(dose.record.takenAt)}`
      : ''

  function close() {
    onOpen(false)
    trigger.current?.focus()
  }

  return (
    <>
      <Button
        ref={(node) => {
          trigger.current = node
        }}
        type="button"
        variant="outline"
        className="min-h-11"
        aria-expanded={open}
        aria-controls={id}
        aria-label={`${editing ? `Edit intake for ${medicine.label} at ${doseClock(dose.dueAt)}` : `Mark ${medicine.label} at ${doseClock(dose.dueAt)} as taken`}`}
        disabled={saving || blocked}
        onClick={() => {
          if (editing && dose.status === 'Taken') {
            setTakenAt(originalLocalTime)
            setQuantity(String(dose.record.quantity))
          } else if (!takenAt) {
            const now = new Date()
            setTakenAt(`${istanbulDate(now)}T${doseClock(now.toISOString())}`)
          }
          onOpen(!open)
        }}
      >
        {editing ? 'Edit intake' : 'Mark as taken'}
      </Button>
      <form
        id={id}
        hidden={!open}
        onSubmit={save}
        aria-busy={saving}
        onKeyDown={(event: KeyboardEvent<HTMLFormElement>) => {
          if (event.key === 'Escape' && !saving) {
            event.preventDefault()
            close()
          }
        }}
      >
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
              className="meddies-field"
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
              className="meddies-field"
              type="number"
              inputMode="decimal"
              required
              min={step}
              step={step}
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" size="sheet" disabled={saving}>
              {saving ? 'Saving intake...' : editing ? 'Save intake changes' : 'Save taken dose'}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="min-h-11"
              disabled={saving}
              onClick={close}
            >
              Cancel
            </Button>
          </div>
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
