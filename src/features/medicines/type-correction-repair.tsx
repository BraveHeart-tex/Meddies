'use client'

import { useEffect, useId, useRef } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { ArrowRight, ChevronLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Field, FieldLabel, FieldDescription, FieldError, FieldGroup } from '@/components/ui/field'
import { QuantityStepper } from '@/components/quantity-stepper'
import { formatShortDay, formatTime } from '@/lib/calendar-date'
import { quantityLabel, quantityProblem, quantityRule, unitName } from '@/lib/quantity-policy'
import { useCurrentMinute } from '../schedules/use-current-minute'
import type { MedicineRecord } from './contract'
import type { TypeCorrectionReview } from './type-correction-contract'

/** One advisory conflict, in the server's queue order. Raw edits are owned by the record's
 * Session draft, never inferred from saved quantities. Queue exit belongs to the next slice.
 */
export function TypeCorrectionRepair({
  medicine,
  review,
  index,
  value,
  onValueChange,
  onBack,
  onContinue,
  onCancel,
}: {
  medicine: Pick<MedicineRecord, 'label' | 'strength'>
  review: TypeCorrectionReview
  index: number
  value: string
  onValueChange: (value: string) => void
  onBack: () => void
  onContinue: () => void
  onCancel: () => void
}) {
  const conflict = review.conflicts[index]
  const schedule = conflict.kind === 'schedule'
  const heading = useRef<HTMLHeadingElement>(null)
  const id = useId()
  const today = useCurrentMinute(true).slice(0, 10)
  const schema = z.object({
    amount: z.string().superRefine((text, context) => {
      const message = quantityProblem(text, review.unit)
      if (message) context.addIssue({ code: 'custom', message })
    }),
  })
  const form = useForm<z.input<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { amount: value },
  })
  useEffect(() => {
    heading.current?.focus()
  }, [])
  const units = unitName(null, review.unit)
  const title = schedule ? `How many ${units} per dose?` : `How many ${units} was this dose?`
  return (
    <div className="flex flex-col gap-7 pb-5">
      <Button variant="ghost" className="-ml-3 self-start" onClick={onBack}>
        <ChevronLeft data-icon="inline-start" aria-hidden="true" />
        Back
      </Button>
      <header className="flex flex-col gap-3">
        <p className="text-body-sm font-bold text-muted-foreground">
          {medicine.label}
          {medicine.strength ? ` · ${medicine.strength}` : ''}
        </p>
        <h1 ref={heading} tabIndex={-1} className="text-title font-extrabold outline-none">
          {title}
        </h1>
      </header>
      <form
        noValidate
        className="flex flex-col gap-7"
        onSubmit={(event) =>
          void form.handleSubmit(() => {
            if (index < review.conflicts.length - 1) onContinue()
          })(event)
        }
      >
        <Card className="py-4">
          <CardContent className="flex flex-col gap-3 px-4">
            <p className="text-caption font-bold text-muted-foreground">
              Amount {index + 1} of {review.conflicts.length}
            </p>
            <p className="text-body-lg font-extrabold">
              {schedule
                ? `${conflict.version.replacedAt ? 'Earlier' : 'Current'} schedule · ${conflict.time}`
                : `Taken · ${formatShortDay(conflict.time, today)} at ${formatTime(conflict.time)}`}
            </p>
            {schedule && (
              <p className="text-body-sm text-muted-foreground">
                {conflict.version.replacedAt
                  ? `${formatShortDay(conflict.version.startDate, today)} to ${formatShortDay(conflict.version.replacedAt, today)}`
                  : `From ${formatShortDay(conflict.version.startDate, today)}`}
              </p>
            )}
            {conflict.kind === 'unscheduled' && (
              <p className="text-body-sm text-muted-foreground">Unscheduled dose</p>
            )}
            <p className="text-body-sm">
              Saved as <strong>{quantityLabel(conflict.quantity, review.fromUnit)}</strong>
            </p>
          </CardContent>
        </Card>
        <FieldGroup>
          <Controller
            name="amount"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor={id}>Amount</FieldLabel>
                <QuantityStepper
                  ref={field.ref}
                  id={id}
                  label="Amount"
                  unit={review.unit}
                  value={field.value}
                  onValueChange={(text) => {
                    field.onChange(text)
                    onValueChange(text)
                  }}
                  onBlur={field.onBlur}
                  aria-invalid={fieldState.invalid}
                  aria-describedby={`${fieldState.invalid ? `${id}-error ` : ''}${id}-help`}
                  grow
                />
                <FieldError id={`${id}-error`} errors={[fieldState.error]} />
                <FieldDescription id={`${id}-help`}>
                  Enter the {unitName(1, review.unit)} amount for this dose.
                  {quantityRule(review.unit).step === 1 ? ' Use a whole number.' : ''}
                </FieldDescription>
              </Field>
            )}
          />
        </FieldGroup>
        <div className="flex flex-col gap-2">
          {index < review.conflicts.length - 1 && (
            <Button type="submit" size="lg">
              Continue
              <ArrowRight data-icon="inline-end" aria-hidden="true" />
            </Button>
          )}
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel change
          </Button>
        </div>
        <p className="text-caption text-muted-foreground">
          Nothing saves until you review and save all changes.
        </p>
      </form>
    </div>
  )
}
