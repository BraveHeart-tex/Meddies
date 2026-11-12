'use client'

import { useId } from 'react'
import { Controller, type Control } from 'react-hook-form'
import { QuantityStepper } from '@/components/quantity-stepper'
import { Button } from '@/components/ui/button'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import { TimePicker } from '@/components/ui/time-picker'
import type { DoseUnit } from '@/lib/dose-quantity'
import type { ScheduleFormOutput, ScheduleFormValues } from './schedule-form-schema'

/**
 * One "Time N" row: time on its own line, quantity below it at every width (107·A7). Each row
 * owns its errors and border. Ids come from `useId`, so they match on the server and follow the
 * row through removals while the parent keys rows by field id; labels use its position.
 */
export function ScheduleTimeRow({
  control,
  index,
  unit,
  disabled,
  onTimeChange,
  onRemove,
}: {
  control: Control<ScheduleFormValues, unknown, ScheduleFormOutput>
  index: number
  unit: DoseUnit
  disabled: boolean
  onTimeChange: () => void
  /** Present from two rows on. */
  onRemove?: () => void
}) {
  const label = `Time ${index + 1}`
  const rowId = useId()
  const timeId = `dose-time-${rowId}`
  const quantityId = `dose-quantity-${rowId}`
  return (
    <div className="flex flex-col gap-3 rounded-xl border bg-card p-4 has-aria-invalid:border-destructive">
      <Controller
        name={`times.${index}.time`}
        control={control}
        render={({ field, fieldState }) => (
          <Field data-invalid={fieldState.invalid}>
            <FieldLabel htmlFor={timeId}>{label}</FieldLabel>
            <TimePicker
              ref={field.ref}
              id={timeId}
              label={label}
              value={field.value}
              onValueChange={(value) => {
                field.onChange(value)
                onTimeChange()
              }}
              onBlur={field.onBlur}
              disabled={disabled}
              aria-invalid={fieldState.invalid}
              aria-describedby={fieldState.invalid ? `${timeId}-error` : undefined}
            />
            <FieldError id={`${timeId}-error`} errors={[fieldState.error]} />
          </Field>
        )}
      />
      <Controller
        name={`times.${index}.quantity`}
        control={control}
        render={({ field, fieldState }) => (
          <Field data-invalid={fieldState.invalid}>
            <FieldLabel htmlFor={quantityId}>
              Quantity<span className="sr-only"> for {label.toLowerCase()}</span>
            </FieldLabel>
            <QuantityStepper
              ref={field.ref}
              id={quantityId}
              label={`${label} quantity`}
              unit={unit}
              value={field.value}
              onValueChange={field.onChange}
              onBlur={field.onBlur}
              disabled={disabled}
              aria-invalid={fieldState.invalid}
              aria-describedby={
                fieldState.invalid ? `${quantityId}-error quantity-help` : 'quantity-help'
              }
            />
            <FieldError id={`${quantityId}-error`} errors={[fieldState.error]} />
          </Field>
        )}
      />
      {onRemove && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="self-start"
          disabled={disabled}
          onClick={onRemove}
        >
          Remove {label.toLowerCase()}
        </Button>
      )}
    </div>
  )
}
