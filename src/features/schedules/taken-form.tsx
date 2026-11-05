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
  open,
  blocked,
  saving,
  error,
  onOpen,
  onSubmit,
}: {
  dose: DoseOccurrence
  medicine: Medicine
  open: boolean
  blocked: boolean
  saving: boolean
  error: string
  onOpen: (open: boolean) => void
  onSubmit: (details: { takenAt: TakenDoseInput['takenAt'] | null; quantity: number }) => void
}) {
  const id = useId()
  const trigger = useRef<HTMLButtonElement>(null)
  const [takenAt, setTakenAt] = useState('')
  const [quantity, setQuantity] = useState(String(dose.quantity))
  const step = medicine.unit === 'capsule' ? 1 : 0.5

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    onSubmit({
      takenAt: new Date(`${takenAt}+03:00`).toJSON(),
      quantity: Number(quantity),
    })
  }

  function close() {
    onOpen(false)
    trigger.current?.focus()
  }

  return (
    <>
      <Button
        ref={trigger}
        type="button"
        variant="outline"
        className="min-h-11"
        aria-expanded={open}
        aria-controls={id}
        aria-label={`Mark ${medicine.label} at ${doseClock(dose.dueAt)} as taken`}
        disabled={saving || blocked}
        onClick={() => {
          if (!takenAt) {
            const now = new Date()
            setTakenAt(`${istanbulDate(now)}T${doseClock(now.toISOString())}`)
          }
          onOpen(!open)
        }}
      >
        Mark as taken
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
          <div className="flex flex-wrap gap-2">
            <Button type="submit" className="min-h-11" disabled={saving}>
              {saving ? 'Saving intake...' : 'Save taken dose'}
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
