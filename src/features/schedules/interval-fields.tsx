'use client'

import { useState, type Ref } from 'react'
import { QuantityStepper } from '@/components/quantity-stepper'
import { DatePicker, type PickerHandle } from '@/components/ui/date-picker'
import { Field, FieldDescription, FieldError, FieldLabel, FieldTitle } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { TimePicker } from '@/components/ui/time-picker'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { shiftDate } from '@/lib/calendar-date'
import type { DoseUnit } from '@/lib/dose-quantity'

const HOUR_PRESETS = ['4', '6', '8', '12', '24']
const fieldError = (message: string | undefined) => (message ? { message } : undefined)

type FieldProps = {
  value: string
  error?: string
  onChange: (value: string) => void
  onBlur?: () => void
}

/** The Every sheet: presets, or Other with exact hours (212·C3, C9). */
export function IntervalHoursField({
  value,
  error,
  onChange,
  onBlur,
  inputRef,
}: FieldProps & { inputRef?: Ref<HTMLInputElement> }) {
  const isPreset = HOUR_PRESETS.includes(value)
  const [custom, setCustom] = useState(value !== '' && !isPreset)
  const selected = custom ? 'other' : isPreset ? value : null
  return (
    <Field data-invalid={Boolean(error)}>
      <FieldTitle id="interval-hours-title" className="sr-only">
        Hours between doses
      </FieldTitle>
      <ToggleGroup
        variant="outline"
        spacing={1.5}
        className="grid w-full grid-cols-3"
        aria-labelledby="interval-hours-title"
        aria-describedby={error ? 'interval-hours-error' : undefined}
        value={selected ? [selected] : []}
        onValueChange={(next) => {
          const choice = next[0]
          if (!choice) return
          setCustom(choice === 'other')
          onChange(choice === 'other' ? '' : choice)
        }}
      >
        {HOUR_PRESETS.map((preset) => (
          <ToggleGroupItem key={preset} value={preset}>
            {preset} hours
          </ToggleGroupItem>
        ))}
        <ToggleGroupItem value="other">Other</ToggleGroupItem>
      </ToggleGroup>
      {custom && (
        <div className="flex flex-col gap-1.5">
          <FieldLabel htmlFor="interval-hours">Exact hours</FieldLabel>
          <div className="flex min-w-0 items-center gap-2">
            <Input
              ref={inputRef}
              id="interval-hours"
              inputMode="numeric"
              autoComplete="off"
              enterKeyHint="done"
              className="w-20 shrink-0 text-center font-extrabold"
              value={value}
              onChange={(event) => onChange(event.target.value)}
              onBlur={onBlur}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? 'interval-hours-error' : 'interval-hours-help'}
            />
            <span className="font-bold text-muted-foreground">
              {value === '1' ? 'hour' : 'hours'}
            </span>
          </div>
          <FieldDescription id="interval-hours-help">Whole hours, from 1 to 24.</FieldDescription>
        </div>
      )}
      <FieldError id="interval-hours-error" errors={[fieldError(error)]} />
    </Field>
  )
}

/** First date on the Starts sheet: Today, Tomorrow, or Other with the date picker (212·C4). */
export function IntervalFirstDateField({
  value,
  error,
  onChange,
  onBlur,
  today,
  min = today,
  inputRef,
}: FieldProps & {
  today: string
  /** Earliest choosable date; earlier than today only to retry an unconfirmed save. */
  min?: string
  inputRef?: Ref<PickerHandle>
}) {
  const tomorrow = shiftDate(today, 1)
  const [other, setOther] = useState(value !== today && value !== tomorrow)
  const selected = other ? 'other' : value === today ? 'today' : 'tomorrow'
  return (
    <Field data-invalid={Boolean(error)}>
      <FieldTitle id="interval-date-title">First date</FieldTitle>
      <ToggleGroup
        variant="outline"
        spacing={1.5}
        className="grid w-full grid-cols-3"
        aria-labelledby="interval-date-title"
        value={[selected]}
        onValueChange={(next) => {
          const choice = next[0]
          if (!choice) return
          setOther(choice === 'other')
          if (choice === 'today') onChange(today)
          if (choice === 'tomorrow') onChange(tomorrow)
        }}
      >
        <ToggleGroupItem value="today">Today</ToggleGroupItem>
        <ToggleGroupItem value="tomorrow">Tomorrow</ToggleGroupItem>
        <ToggleGroupItem value="other">Other</ToggleGroupItem>
      </ToggleGroup>
      {other && (
        <DatePicker
          ref={inputRef}
          id="interval-date"
          label="First date"
          today={today}
          min={min}
          max="2099-12-31"
          value={value}
          onValueChange={onChange}
          onBlur={onBlur}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? 'interval-date-error' : undefined}
        />
      )}
      <FieldError id="interval-date-error" errors={[fieldError(error)]} />
    </Field>
  )
}

export function IntervalFirstTimeField({
  value,
  error,
  onChange,
  onBlur,
  inputRef,
}: FieldProps & { inputRef?: Ref<PickerHandle> }) {
  return (
    <Field data-invalid={Boolean(error)}>
      <FieldLabel htmlFor="interval-time">First time</FieldLabel>
      <TimePicker
        ref={inputRef}
        id="interval-time"
        label="First time"
        value={value}
        onValueChange={onChange}
        onBlur={onBlur}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? 'interval-time-error interval-time-help' : 'interval-time-help'}
      />
      <FieldDescription id="interval-time-help">
        It can be earlier today. Doses count forward from this time.
      </FieldDescription>
      <FieldError id="interval-time-error" errors={[fieldError(error)]} />
    </Field>
  )
}

/** The Take sheet (212·C5). */
export function IntervalQuantityField({
  value,
  error,
  onChange,
  onBlur,
  unit,
  inputRef,
}: FieldProps & { unit: DoseUnit; inputRef?: Ref<HTMLInputElement> }) {
  return (
    <Field data-invalid={Boolean(error)}>
      <FieldLabel htmlFor="interval-quantity">Quantity</FieldLabel>
      <QuantityStepper
        ref={inputRef}
        id="interval-quantity"
        label="Quantity"
        unit={unit}
        value={value}
        onValueChange={onChange}
        onBlur={onBlur}
        aria-invalid={error ? true : undefined}
        aria-describedby={
          error ? 'interval-quantity-error interval-quantity-help' : 'interval-quantity-help'
        }
      />
      <FieldDescription id="interval-quantity-help">
        Quantity is how much you take each time, not the strength on the pack.
      </FieldDescription>
      <FieldError id="interval-quantity-error" errors={[fieldError(error)]} />
    </Field>
  )
}
