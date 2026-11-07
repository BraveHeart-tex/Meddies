'use client'

import * as React from 'react'
import { Calendar } from '@/components/ui/calendar'
import { Icon } from '@/components/ui/icon'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useCompositeBlur } from '@/components/ui/use-composite-blur'
import { calendarDay, dateLabel, dateValue } from '@/lib/calendar-date'
import { cn } from '@/lib/utils'

export const pickerTriggerClassName =
  'flex min-h-12 w-full min-w-0 items-center gap-2 rounded-md border border-input bg-card py-2 pr-4 pl-4 text-left text-base font-semibold text-foreground transition-colors duration-140 ease-calm outline-none select-none active:bg-secondary focus-visible:border-ring focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 data-popup-open:border-ring aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20'

/** What a form library needs to focus a picker, such as React Hook Form's `field.ref`. */
export type PickerHandle = { focus: () => void }

/**
 * Controlled date-only picker for Istanbul calendar days ('YYYY-MM-DD', '' when unset). Pass
 * `today` as the Istanbul date so the highlighted day never follows the device timezone. `ref`
 * focuses the trigger; `onBlur` runs when focus leaves both the trigger and the calendar. With
 * `name`, the value submits with its form.
 */
export function DatePicker({
  ref,
  id,
  label,
  value,
  onValueChange,
  onBlur,
  today,
  min,
  max,
  name,
  disabled,
  className,
  finalFocus,
  'aria-describedby': describedBy,
  'aria-invalid': invalid,
}: {
  ref?: React.Ref<PickerHandle>
  id: string
  /** Accessible name; the trigger announces it with the selected date. */
  label: string
  value: string
  onValueChange: (value: string) => void
  onBlur?: () => void
  today: string
  min?: string
  max?: string
  name?: string
  disabled?: boolean
  className?: string
  /** Where focus goes when the calendar closes; the trigger by default. */
  finalFocus?: React.ComponentProps<typeof PopoverContent>['finalFocus']
  'aria-describedby'?: string
  'aria-invalid'?: boolean
}) {
  const [open, setOpen] = React.useState(false)
  const trigger = React.useRef<HTMLButtonElement>(null)
  const { track, onPartBlur } = useCompositeBlur(onBlur)
  React.useImperativeHandle(ref, () => ({ focus: () => trigger.current?.focus() }), [])
  const selected = value ? calendarDay(value) : undefined
  const display = value ? dateLabel(value, today) : ''
  const bounds = [
    ...(min ? [{ before: calendarDay(min) }] : []),
    ...(max ? [{ after: calendarDay(max) }] : []),
  ]

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) onPartBlur()
      }}
    >
      <PopoverTrigger
        ref={(node: HTMLButtonElement | null) => {
          trigger.current = node
          const untrack = track(node)
          return () => {
            trigger.current = null
            untrack?.()
          }
        }}
        id={id}
        disabled={disabled}
        aria-label={`${label}, ${display || 'not set'}`}
        aria-describedby={describedBy}
        aria-invalid={invalid || undefined}
        className={cn(pickerTriggerClassName, className)}
        onBlur={onPartBlur}
      >
        <Icon name="calendar" size={18} className="shrink-0 text-muted-foreground" />
        <span className={cn('flex-1 [overflow-wrap:anywhere]', !value && 'text-muted-foreground')}>
          {display || 'Choose a date'}
        </span>
      </PopoverTrigger>
      {name && <input type="hidden" name={name} value={value} />}
      <PopoverContent
        ref={track}
        align="start"
        aria-label={label}
        // At 360px and below the calendar spans the screen so its days stay as large as fit.
        className="w-auto p-1 max-[360px]:w-(--available-width) max-[360px]:p-0"
        // The calendar focuses the selected day itself.
        initialFocus={false}
        finalFocus={finalFocus}
        onBlur={onPartBlur}
      >
        <Calendar
          mode="single"
          autoFocus
          required
          className="max-[360px]:mx-auto max-[360px]:p-1 max-[360px]:[--cell-size:min(2.75rem,calc((var(--available-width)_-_0.625rem)/7))]"
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
