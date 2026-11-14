'use client'

import { Controller, type Control } from 'react-hook-form'
import { Field, FieldError, FieldLabel, FieldTitle } from '@/components/ui/field'
import { TimePicker } from '@/components/ui/time-picker'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { formatLongDay, formatShortDay } from '@/lib/calendar-date'
import type { TakenFormValues } from './taken-form-schema'
import { useSchedulingClock } from './scheduling-clock'

// A swipe that starts on a control never closes the drawer.
const swipeIgnore = { 'data-base-ui-swipe-ignore': 'y' }

/**
 * Taken at _Other_: the Taken date as a ToggleGroup of `days` (takenDayOptions) shown as short
 * days and named as long days, then the time on its own row so its digits stay on one line at
 * 320px (#277). Shared by the record drawer and the Unscheduled dose drawers.
 */
export function TakenOtherFields({
  id,
  control,
  days,
  today,
  saving,
}: {
  id: string
  control: Control<TakenFormValues, unknown, unknown>
  days: string[]
  today: string
  saving: boolean
}) {
  const clock = useSchedulingClock()
  return (
    <>
      <Controller
        name="date"
        control={control}
        render={({ field, fieldState }) => (
          <Field data-invalid={fieldState.invalid} className="gap-2.5">
            <FieldTitle id={`${id}-date`}>Taken date</FieldTitle>
            <ToggleGroup
              {...swipeIgnore}
              aria-labelledby={`${id}-date`}
              aria-describedby={fieldState.invalid ? `${id}-date-error` : undefined}
              variant="outline"
              className="w-full flex-wrap"
              value={field.value ? [field.value] : []}
              onValueChange={(value) => {
                const next = value[0] as string | undefined
                if (next) field.onChange(next)
              }}
              onBlur={field.onBlur}
            >
              {days.map((day, index) => {
                // Invalid-submit focus lands on the chosen day, or the first with none chosen.
                const focusTarget = field.value ? field.value === day : index === 0
                return (
                  <ToggleGroupItem
                    key={day}
                    ref={focusTarget ? field.ref : undefined}
                    value={day}
                    className="flex-1"
                    aria-label={formatLongDay(day, today)}
                    aria-invalid={fieldState.invalid || undefined}
                  >
                    {formatShortDay(day, today)}
                  </ToggleGroupItem>
                )
              })}
            </ToggleGroup>
            <FieldError id={`${id}-date-error`} errors={[fieldState.error]} />
          </Field>
        )}
      />
      <Controller
        name="time"
        control={control}
        render={({ field, fieldState }) => (
          <Field data-invalid={fieldState.invalid} {...swipeIgnore}>
            <FieldLabel htmlFor={`${id}-time`}>Taken time</FieldLabel>
            <TimePicker
              now={clock.now}
              ref={field.ref}
              id={`${id}-time`}
              label="Taken time in Istanbul"
              value={field.value}
              onValueChange={field.onChange}
              onBlur={field.onBlur}
              disabled={saving}
              aria-invalid={fieldState.invalid}
              aria-describedby={fieldState.invalid ? `${id}-time-error` : undefined}
            />
            <FieldError id={`${id}-time-error`} errors={[fieldState.error]} />
          </Field>
        )}
      />
    </>
  )
}
