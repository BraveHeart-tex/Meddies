'use client'

import { Minus, Plus } from 'lucide-react'
import type { Ref } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  parseQuantity,
  quantityRule,
  stepQuantity,
  unitName,
  type DoseUnit,
} from '@/lib/dose-quantity'

/**
 * Dose quantity in tablets or capsules: "−" and "+" step by the unit's rule, and the
 * text stays editable, blank included, so a form schema decides what is valid. The unit and its
 * plural always show beside the number. `ref` focuses the text input.
 */
export function QuantityStepper({
  ref,
  id,
  label,
  unit,
  value,
  onValueChange,
  onBlur,
  disabled,
  'aria-describedby': describedBy,
  'aria-invalid': invalid,
}: {
  ref?: Ref<HTMLInputElement>
  id: string
  /** Accessible name of the input; the buttons announce "Fewer"/"More" with it. */
  label: string
  unit: DoseUnit
  value: string
  onValueChange: (value: string) => void
  onBlur?: () => void
  disabled?: boolean
  'aria-describedby'?: string
  'aria-invalid'?: boolean
}) {
  const number = parseQuantity(value)
  const atMinimum = number !== null && number <= quantityRule(unit).min
  return (
    <div className="flex min-w-0 items-center gap-2">
      <Button
        type="button"
        variant="secondary"
        size="icon"
        aria-label={`Fewer: ${label}`}
        aria-controls={id}
        disabled={disabled || atMinimum}
        onClick={() => onValueChange(stepQuantity(value, unit, -1))}
      >
        <Minus aria-hidden="true" data-icon="inline-start" />
      </Button>
      <Input
        ref={ref}
        id={id}
        inputMode="decimal"
        autoComplete="off"
        enterKeyHint="done"
        className="w-20 shrink-0 text-center font-extrabold"
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
        onBlur={onBlur}
        disabled={disabled}
        aria-invalid={invalid || undefined}
        aria-describedby={[`${id}-unit`, describedBy].filter(Boolean).join(' ')}
      />
      <Button
        type="button"
        variant="secondary"
        size="icon"
        aria-label={`More: ${label}`}
        aria-controls={id}
        disabled={disabled}
        onClick={() => onValueChange(stepQuantity(value, unit, 1))}
      >
        <Plus aria-hidden="true" data-icon="inline-start" />
      </Button>
      <span id={`${id}-unit`} className="font-bold text-muted-foreground">
        {unitName(Number.isNaN(number) ? null : number, unit)}
      </span>
    </div>
  )
}
