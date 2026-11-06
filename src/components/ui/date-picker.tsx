'use client'

import * as React from 'react'
import { Calendar } from '@/components/ui/calendar'
import { Icon } from '@/components/ui/icon'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { calendarDay, dateLabel, dateValue } from '@/lib/calendar-date'
import { cn } from '@/lib/utils'

export const pickerTriggerClassName =
  'flex min-h-12 w-full min-w-0 items-center gap-2 rounded-md border border-input bg-card py-2 pr-4 pl-4 text-left text-base font-semibold text-foreground transition-colors duration-140 ease-calm outline-none select-none active:bg-secondary focus-visible:border-ring focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 data-popup-open:border-ring aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20'

/**
 * Date-only picker for Istanbul calendar days ('YYYY-MM-DD'). Pass `today` as the Istanbul date
 * so the highlighted day never follows the device timezone. With `name`, the value submits with
 * its form.
 */
export function DatePicker({
  id,
  label,
  value,
  onValueChange,
  today,
  min,
  max,
  name,
  disabled,
  className,
  'aria-describedby': describedBy,
  'aria-invalid': invalid,
}: {
  id: string
  /** Accessible name; the trigger announces it with the selected date. */
  label: string
  value: string
  onValueChange: (value: string) => void
  today: string
  min?: string
  max?: string
  name?: string
  disabled?: boolean
  className?: string
  'aria-describedby'?: string
  'aria-invalid'?: boolean
}) {
  const [open, setOpen] = React.useState(false)
  const selected = value ? calendarDay(value) : undefined
  const bounds = [
    ...(min ? [{ before: calendarDay(min) }] : []),
    ...(max ? [{ after: calendarDay(max) }] : []),
  ]

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        id={id}
        disabled={disabled}
        aria-label={`${label}, ${value ? dateLabel(value) : 'not set'}`}
        aria-describedby={describedBy}
        aria-invalid={invalid || undefined}
        className={cn(pickerTriggerClassName, className)}
      >
        <Icon name="calendar" size={18} className="shrink-0 text-muted-foreground" />
        <span className={cn('flex-1 [overflow-wrap:anywhere]', !value && 'text-muted-foreground')}>
          {value ? dateLabel(value) : 'Choose a date'}
        </span>
      </PopoverTrigger>
      {name && <input type="hidden" name={name} value={value} />}
      <PopoverContent
        align="start"
        aria-label={label}
        className="w-auto p-1"
        // The calendar focuses the selected day itself.
        initialFocus={false}
      >
        <Calendar
          mode="single"
          autoFocus
          required
          selected={selected}
          defaultMonth={selected ?? calendarDay(today)}
          today={calendarDay(today)}
          startMonth={min ? calendarDay(min) : undefined}
          endMonth={max ? calendarDay(max) : undefined}
          disabled={bounds}
          weekStartsOn={1}
          onSelect={(day) => {
            onValueChange(dateValue(day))
            setOpen(false)
          }}
        />
      </PopoverContent>
    </Popover>
  )
}
