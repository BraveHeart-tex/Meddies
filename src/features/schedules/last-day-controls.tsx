'use client'

import { useRef, useState, type Ref } from 'react'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { DatePicker, type PickerHandle } from '@/components/ui/date-picker'
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field'
import { calendarDay, dateValue, formatShortDay } from '@/lib/calendar-date'
import { IntervalRow, IntervalSheet } from './interval-setup-parts'

type LastDayProps = {
  value: string | null
  onChange: (next: string | null) => void
  /** Istanbul today on the scheduling clock. */
  today: string
  /** The earliest day the calendar offers. */
  min: string
  error?: string
  disabled?: boolean
}

/** Set times: a DatePicker under Start date, removable once set (227·A1 to A3). */
export function LastDayField({
  ref,
  value,
  onChange,
  onBlur,
  today,
  min,
  error,
  disabled,
}: LastDayProps & { ref?: Ref<PickerHandle>; onBlur?: () => void }) {
  const picker = useRef<PickerHandle>(null)
  return (
    <Field data-invalid={Boolean(error)}>
      <FieldLabel htmlFor="last-day">Last day (optional)</FieldLabel>
      <DatePicker
        ref={(handle: PickerHandle | null) => {
          picker.current = handle
          if (typeof ref === 'function') ref(handle)
          else if (ref) ref.current = handle
        }}
        id="last-day"
        label="Last day"
        today={today}
        min={min}
        max="2099-12-31"
        value={value ?? ''}
        onValueChange={(next) => onChange(next || null)}
        onBlur={onBlur}
        disabled={disabled}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? 'last-day-error last-day-help' : 'last-day-help'}
      />
      <FieldError id="last-day-error">{error}</FieldError>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <FieldDescription id="last-day-help">
          {value ? 'Doses on this day still count.' : 'Leave it empty to keep going.'}
        </FieldDescription>
        {value && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={disabled}
            onClick={() => {
              onChange(null)
              // The button goes with the value, so focus stays on the field.
              picker.current?.focus()
            }}
          >
            Remove last day
          </Button>
        )}
      </div>
    </Field>
  )
}

/**
 * Every few hours: its own row, opening a calendar sheet with No last day (227·A4 to A6). The
 * sheet edits a draft; Done applies it, Cancel and dismissal keep the value.
 */
export function LastDayRow({
  rowRef,
  value,
  onChange,
  today,
  min,
  error,
  disabled,
  defaultOpen = false,
}: LastDayProps & { rowRef?: Ref<HTMLButtonElement>; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  const [draft, setDraft] = useState(value)
  const shortDay = (date: string) => formatShortDay(date, today)
  return (
    <>
      <ul className="divide-y rounded-xl border bg-card">
        <IntervalRow
          ref={rowRef}
          id="last-day-row"
          label="Last day"
          value={value ? shortDay(value) : 'None'}
          error={error}
          disabled={disabled}
          onClick={() => {
            setDraft(value)
            setOpen(true)
          }}
        />
      </ul>
      <IntervalSheet
        open={open}
        title="Last day"
        onCancel={() => setOpen(false)}
        onDone={() => {
          onChange(draft)
          setOpen(false)
        }}
      >
        <div className="@container">
          <Calendar
            mode="single"
            // Seven columns spanning the sheet, so its edges meet No last day's.
            className="w-full! bg-transparent! p-0! [--cell-size:calc(100cqw/7)]"
            selected={draft ? calendarDay(draft) : undefined}
            defaultMonth={calendarDay(draft && draft > min ? draft : min)}
            today={calendarDay(today)}
            startMonth={calendarDay(min)}
            disabled={[{ before: calendarDay(min) }]}
            weekStartsOn={1}
            onSelect={(day) => setDraft(day ? dateValue(day) : null)}
          />
        </div>
        <p className="text-center text-body-sm text-muted-foreground" aria-live="polite">
          {draft
            ? `Doses on ${shortDay(draft)} still count. None after it.`
            : 'No last day. It keeps going until you change it.'}
        </p>
        <Button
          type="button"
          size="lg"
          variant="outline"
          className="w-full"
          disabled={!draft}
          onClick={() => setDraft(null)}
        >
          No last day
        </Button>
      </IntervalSheet>
    </>
  )
}
