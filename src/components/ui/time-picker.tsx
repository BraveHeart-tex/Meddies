'use client'

import * as React from 'react'
import type { PickerHandle } from '@/components/ui/date-picker'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useCompositeBlur } from '@/components/ui/use-composite-blur'
import { joinTime, timeParts, type TimeParts } from '@/lib/time-of-day'

const twoDigits = (count: number) =>
  Array.from({ length: count }, (_, index) => {
    const value = String(index).padStart(2, '0')
    return { value, label: value }
  })
const HOURS = twoDigits(24)
const MINUTES = twoDigits(60)

/**
 * Controlled 24-hour time from hour and minute selects. The value is '' until a half is chosen,
 * then 'HH:', ':MM' or 'HH:MM', so a half-chosen time keeps its half and stays distinguishable
 * from a complete one (check with `isTimeOfDay`). Both halves always show the value, so a reset
 * clears them. `id` lands on the hour trigger for an external label; `ref` focuses the first
 * unchosen half; `onBlur` runs when focus leaves both halves and their lists.
 */
export function TimePicker({
  ref,
  id,
  label,
  value,
  onValueChange,
  onBlur,
  required,
  disabled,
  'aria-describedby': describedBy,
  'aria-invalid': invalid,
}: {
  ref?: React.Ref<PickerHandle>
  id: string
  /** Accessible name prefix: triggers announce '<label> hour' and '<label> minute'. */
  label: string
  value: string
  onValueChange: (value: string) => void
  onBlur?: () => void
  required?: boolean
  disabled?: boolean
  'aria-describedby'?: string
  'aria-invalid'?: boolean
}) {
  const parts = timeParts(value)
  const triggers = React.useRef<Record<keyof TimeParts, HTMLButtonElement | null>>({
    hour: null,
    minute: null,
  })
  const { track, onPartBlur } = useCompositeBlur(onBlur)
  React.useImperativeHandle(
    ref,
    () => ({
      focus: () => {
        const { hour, minute } = triggers.current
        ;(parts.hour && !parts.minute ? minute : hour)?.focus()
      },
    }),
    [parts.hour, parts.minute],
  )

  const field = (part: keyof TimeParts, items: typeof HOURS) => (
    <Select
      items={items}
      value={parts[part] || null}
      onValueChange={(next) => onValueChange(joinTime({ ...parts, [part]: next ?? '' }))}
      onOpenChange={(open) => {
        if (!open) onPartBlur()
      }}
      required={required}
      disabled={disabled}
    >
      <SelectTrigger
        ref={(node: HTMLButtonElement | null) => {
          triggers.current[part] = node
          const untrack = track(node)
          return () => {
            triggers.current[part] = null
            untrack?.()
          }
        }}
        id={part === 'hour' ? id : `${id}-minute`}
        aria-label={`${label} ${part}`}
        aria-describedby={describedBy}
        aria-invalid={invalid || undefined}
        className="min-w-0 flex-1 font-extrabold"
        onBlur={onPartBlur}
      >
        <SelectValue placeholder={part === 'hour' ? 'HH' : 'MM'} />
      </SelectTrigger>
      <SelectContent
        ref={track}
        className="max-h-[min(var(--available-height),18rem)]"
        onBlur={onPartBlur}
      >
        {items.map((item) => (
          <SelectItem key={item.value} value={item.value}>
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )

  return (
    <div role="group" aria-label={label} className="flex min-w-0 items-center gap-1.5">
      {field('hour', HOURS)}
      <span aria-hidden="true" className="text-body-lg font-extrabold text-muted-foreground">
        :
      </span>
      {field('minute', MINUTES)}
    </div>
  )
}
