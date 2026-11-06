'use client'

import * as React from 'react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

const twoDigits = (count: number) =>
  Array.from({ length: count }, (_, index) => {
    const value = String(index).padStart(2, '0')
    return { value, label: value }
  })
const HOURS = twoDigits(24)
const MINUTES = twoDigits(60)

const split = (value: string) => {
  const [hour = '', minute = ''] = value ? value.split(':') : []
  return { hour, minute }
}

/**
 * 24-hour time ('HH:MM') from hour and minute selects. Emits '' until both are chosen, so a
 * required time stays invalid while only half of it is set. `id` lands on the hour trigger for
 * an external label.
 */
export function TimePicker({
  id,
  label,
  value,
  onValueChange,
  required,
  disabled,
  'aria-describedby': describedBy,
}: {
  id: string
  /** Accessible name prefix: triggers announce '<label> hour' and '<label> minute'. */
  label: string
  value: string
  onValueChange: (value: string) => void
  required?: boolean
  disabled?: boolean
  'aria-describedby'?: string
}) {
  const [parts, setParts] = React.useState(() => split(value))
  const [shown, setShown] = React.useState(value)
  if (value !== shown) {
    setShown(value)
    setParts(split(value))
  }

  function change(part: 'hour' | 'minute', next: string | null) {
    const updated = { ...parts, [part]: next ?? '' }
    const time = updated.hour && updated.minute ? `${updated.hour}:${updated.minute}` : ''
    setParts(updated)
    setShown(time)
    if (time !== value) onValueChange(time)
  }

  const field = (part: 'hour' | 'minute', items: typeof HOURS) => (
    <Select
      items={items}
      value={parts[part] || null}
      onValueChange={(next) => change(part, next)}
      required={required}
      disabled={disabled}
    >
      <SelectTrigger
        id={part === 'hour' ? id : `${id}-minute`}
        aria-label={`${label} ${part}`}
        aria-describedby={describedBy}
        className="min-w-0 flex-1 font-extrabold"
      >
        <SelectValue placeholder={part === 'hour' ? 'Hour' : 'Min'} />
      </SelectTrigger>
      <SelectContent className="max-h-[min(var(--available-height),18rem)]">
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
