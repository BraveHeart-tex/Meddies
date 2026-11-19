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
  type MedicineType,
} from '@/lib/quantity-policy'
import { cn } from '@/lib/utils'

/**
 * Dose quantity in the Medicine's Quantity unit: "−" and "+" step by the quantity policy, and the
 * text stays editable, blank included, so a form schema decides what is valid. The unit and its
 * plural always show beside the number. `ref` focuses the text input. `grow` stretches the input to
 * fill the row (Clock time rows and the Interval Amount sheet, #265) and reserves the plural's
 * width for the unit, so singular and plural rows line up; the dose drawers keep the compact input.
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
  grow = false,
  zero = false,
  'aria-describedby': describedBy,
  'aria-invalid': invalid,
}: {
  ref?: Ref<HTMLInputElement>
  id: string
  /** Accessible name of the input; the buttons announce "Fewer"/"More" with it. */
  label: string
  unit: MedicineType
  value: string
  onValueChange: (value: string) => void
  onBlur?: () => void
  disabled?: boolean
  /** Fill the row instead of the compact input. */
  grow?: boolean
  /** Step down to zero, as a stock count does; doses stop at the unit's minimum. */
  zero?: boolean
  'aria-describedby'?: string
  'aria-invalid'?: boolean
}) {
  const number = parseQuantity(value)
  const atMinimum = number !== null && number <= (zero ? 0 : quantityRule(unit).min)
  return (
    <div className="flex min-w-0 items-center gap-2">
      <Button
        type="button"
        variant="secondary"
        size="icon"
        aria-label={`Fewer: ${label}`}
        aria-controls={id}
        disabled={disabled || atMinimum}
        onClick={() => onValueChange(stepQuantity(value, unit, -1, zero))}
      >
        <Minus aria-hidden="true" data-icon="inline-start" />
      </Button>
      <Input
        ref={ref}
        id={id}
        inputMode="decimal"
        autoComplete="off"
        enterKeyHint="done"
        className={cn('text-center font-extrabold', grow ? 'min-w-0 flex-1' : 'w-20 shrink-0')}
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
        onClick={() => onValueChange(stepQuantity(value, unit, 1, zero))}
      >
        <Plus aria-hidden="true" data-icon="inline-start" />
      </Button>
      <span className="grid shrink-0 font-bold text-muted-foreground">
        <span id={`${id}-unit`} className="col-start-1 row-start-1">
          {unitName(Number.isNaN(number) ? null : number, unit)}
        </span>
        {grow && (
          <span aria-hidden="true" className="invisible col-start-1 row-start-1">
            {unitName(null, unit)}
          </span>
        )}
      </span>
    </div>
  )
}
