'use client'

import { useId, useState, type FormEvent, type KeyboardEvent } from 'react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Field, FieldLabel } from '@/components/ui/field'
import { Icon } from '@/components/ui/icon'
import { Input } from '@/components/ui/input'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
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

const localMinute = (instant: string) => `${istanbulDate(new Date(instant))}T${doseClock(instant)}`
const instantOf = (local: string) => new Date(`${local}+03:00`)

function offsetLabel(local: string, dueAt: string) {
  const minutes = Math.round((instantOf(local).getTime() - new Date(dueAt).getTime()) / 60000)
  if (!Number.isFinite(minutes)) return ''
  if (minutes === 0) return 'Same as scheduled'
  const size = Math.abs(minutes)
  const span =
    size < 60 ? `${size} min` : `${Math.floor(size / 60)} h${size % 60 ? ` ${size % 60} min` : ''}`
  return `${span} ${minutes > 0 ? 'after' : 'before'} scheduled`
}

type When = 'now' | 'scheduled' | 'other'

// Actual intake details for a Taken outcome. New records open from the sheet's outcome choice;
// recorded doses open through Edit intake.
export function TakenForm({
  dose,
  medicine,
  open,
  saving,
  error,
  onOpen,
  onSubmit,
  editing = false,
  referenceNow,
}: {
  dose: DoseOccurrence
  medicine: Medicine
  open: boolean
  saving: boolean
  error: string
  onOpen: (open: boolean) => void
  onSubmit: (details: { takenAt: TakenDoseInput['takenAt'] | null; quantity: number }) => void
  editing?: boolean
  referenceNow?: string
}) {
  const id = useId()
  const [now] = useState(() => localMinute(referenceNow ?? new Date().toISOString()))
  const [when, setWhen] = useState<When>('now')
  const [other, setOther] = useState('')
  const [quantity, setQuantity] = useState(
    String(dose.status === 'Taken' ? dose.record.quantity : dose.quantity),
  )
  const step = medicine.unit === 'capsule' ? 1 : 0.5
  const scheduled = localMinute(dose.dueAt)
  const scheduledHasPassed = instantOf(scheduled) <= instantOf(now)
  const takenAt = when === 'now' ? now : when === 'scheduled' ? scheduled : other
  const originalLocalTime = dose.status === 'Taken' ? localMinute(dose.record.takenAt) : ''
  const amount = Number(quantity)

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    onSubmit({
      takenAt:
        takenAt === originalLocalTime && dose.status === 'Taken'
          ? dose.record.takenAt
          : instantOf(takenAt).toJSON(),
      quantity: amount,
    })
  }

  function adjust(direction: 1 | -1) {
    const base = Number.isFinite(amount) ? amount : step
    setQuantity(String(Math.max(step, Math.round((base + direction * step) / step) * step)))
  }

  return (
    <>
      {editing && (
        <Button
          type="button"
          variant="outline"
          aria-expanded={open}
          aria-controls={id}
          aria-label={`Edit intake for ${medicine.label} at ${doseClock(dose.dueAt)}`}
          disabled={saving}
          onClick={() => {
            if (dose.status === 'Taken') {
              setWhen('other')
              setOther(originalLocalTime)
              setQuantity(String(dose.record.quantity))
            }
            onOpen(!open)
          }}
        >
          Edit intake
        </Button>
      )}
      <form
        id={id}
        hidden={!open}
        className="basis-full"
        onSubmit={save}
        aria-busy={saving}
        onKeyDown={(event: KeyboardEvent<HTMLFormElement>) => {
          if (event.key === 'Escape' && !saving) {
            event.preventDefault()
            onOpen(false)
          }
        }}
      >
        <fieldset
          disabled={saving}
          aria-describedby={error ? `${id}-error` : undefined}
          className="flex min-w-0 flex-col gap-4.5"
        >
          <legend className="sr-only">Actual intake for {medicine.label}</legend>
          <div className="flex flex-col gap-2.5">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <span id={`${id}-when`} className="font-extrabold">
                Taken at
              </span>
              <span className="text-label font-semibold text-muted-foreground">
                {takenAt && offsetLabel(takenAt, dose.dueAt)}
              </span>
            </div>
            <ToggleGroup
              aria-labelledby={`${id}-when`}
              variant="outline"
              className="w-full flex-wrap"
              value={[when]}
              onValueChange={(value) => {
                const next = value[0] as When | undefined
                if (!next) return
                if (next === 'other' && !other) setOther(takenAt)
                setWhen(next)
              }}
            >
              <ToggleGroupItem value="now" className="flex-1">
                Now · {doseClock(instantOf(now).toISOString())}
              </ToggleGroupItem>
              {scheduledHasPassed && (
                <ToggleGroupItem value="scheduled" className="flex-1">
                  At {doseClock(dose.dueAt)}
                </ToggleGroupItem>
              )}
              <ToggleGroupItem value="other">Other</ToggleGroupItem>
            </ToggleGroup>
            {when === 'other' && (
              <Field>
                <FieldLabel htmlFor={`${id}-time`} className="sr-only">
                  Taken date and time in Istanbul
                </FieldLabel>
                <Input
                  id={`${id}-time`}
                  type="datetime-local"
                  required
                  value={other}
                  onChange={(event) => setOther(event.target.value)}
                />
              </Field>
            )}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card py-2 pr-2 pl-4">
            <label htmlFor={`${id}-quantity`} className="font-extrabold">
              Amount <span className="sr-only">in {medicine.unit}s</span>
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="secondary"
                size="icon"
                className="rounded-sm"
                aria-label="Decrease amount"
                disabled={!(amount > step)}
                onClick={() => adjust(-1)}
              >
                <Icon name="minus" size={14} />
              </Button>
              <div className="flex items-center gap-1.5">
                <Input
                  id={`${id}-quantity`}
                  type="number"
                  inputMode="decimal"
                  required
                  min={step}
                  step={step}
                  value={quantity}
                  onChange={(event) => setQuantity(event.target.value)}
                  className="h-11 w-16 px-2 text-center text-body-lg font-extrabold"
                />
                <span aria-hidden="true" className="text-body-lg font-extrabold">
                  {medicine.unit}
                  {amount === 1 ? '' : 's'}
                </span>
              </div>
              <Button
                type="button"
                variant="secondary"
                size="icon"
                className="rounded-sm"
                aria-label="Increase amount"
                onClick={() => adjust(1)}
              >
                <Icon name="plus" size={14} />
              </Button>
            </div>
          </div>
          {error && (
            <Alert id={`${id}-error`} variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <div className="flex flex-col gap-1.5">
            <Button
              type="submit"
              size="sheet"
              className="w-full whitespace-normal"
              disabled={saving}
            >
              {saving ? 'Saving intake...' : editing ? 'Save intake changes' : 'Save as taken'}
            </Button>
            <Button type="button" variant="ghost" className="w-full" onClick={() => onOpen(false)}>
              Cancel
            </Button>
          </div>
        </fieldset>
      </form>
    </>
  )
}
