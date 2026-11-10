'use client'

import { useState } from 'react'
import { MoonIcon } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { DatePicker } from '@/components/ui/date-picker'
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field'
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer'
import { istanbulDate } from '@/features/schedules/contract'
import { isOvernightDose } from '@/features/schedules/interval-preview'
import {
  CHANGE_KEEPS_EARLIER,
  IntervalRow,
  IntervalSheet,
} from '@/features/schedules/interval-setup-parts'
import { calendarDay, dateValue, formatShortDay, formatTime } from '@/lib/calendar-date'
import { magnesium, TODAY } from './lab-fixtures'
import { shortDay } from './last-day-model'

type LastDayProps = {
  value: string | null
  onChange: (next: string | null) => void
  /** The earliest day the calendar offers. */
  min: string
  error?: string
  disabled?: boolean
}

/** Clock schedule: a DatePicker field beside Start date, removable once set (779·A1 to A3). */
export function LastDayField({ value, onChange, min, error, disabled }: LastDayProps) {
  return (
    <Field data-invalid={Boolean(error)}>
      <FieldLabel htmlFor="last-day">Last day (optional)</FieldLabel>
      <DatePicker
        id="last-day"
        label="Last day"
        today={TODAY}
        min={min}
        max="2099-12-31"
        value={value ?? ''}
        onValueChange={onChange}
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
            onClick={() => onChange(null)}
          >
            Remove last day
          </Button>
        )}
      </div>
    </Field>
  )
}

/** Interval schedule: its own row, opening a calendar sheet with "No last day" (779·A4 to A6). */
export function LastDayRow({
  value,
  onChange,
  min,
  error,
  disabled,
  open: initiallyOpen = false,
}: LastDayProps & { open?: boolean }) {
  const [open, setOpen] = useState(initiallyOpen)
  const [draft, setDraft] = useState(value)
  return (
    <>
      <ul className="divide-y rounded-xl border bg-card">
        <IntervalRow
          id="last-day"
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
            defaultMonth={calendarDay(draft ?? TODAY)}
            today={calendarDay(TODAY)}
            disabled={[{ before: calendarDay(min) }]}
            weekStartsOn={1}
            onSelect={(day) => setDraft(day ? dateValue(day) : null)}
          />
        </div>
        <p className="text-center text-body-sm text-muted-foreground">
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

/** The Last day control each form uses: a field for set times, a row for every few hours. */
export function LastDayControl({
  kind,
  open,
  ...props
}: LastDayProps & { kind: 'times' | 'interval'; open?: boolean }) {
  return kind === 'times' ? <LastDayField {...props} /> : <LastDayRow {...props} open={open} />
}

/**
 * The preview with a Last day: only the doses that will happen, then the day they stop. A
 * change counts from now and says what it keeps (767·A3, A5).
 */
export function LastDayDoses({
  doses,
  lastDay,
  after,
}: {
  doses: string[] | null
  lastDay: string | null
  after?: string
}) {
  const count = doses?.length ?? 0
  const label =
    !lastDay || count === 3 ? 'Next 3 doses' : count === 1 ? 'Next dose' : `Next ${count} doses`
  return (
    <section aria-labelledby="next-doses-heading" aria-live="polite" className="flex flex-col px-1">
      <h2 id="next-doses-heading" className="text-body-sm font-extrabold text-muted-foreground">
        {count === 0 && lastDay
          ? 'Next doses'
          : after
            ? `${label} after ${formatTime(after)}`
            : label}
      </h2>
      {doses ? (
        doses.length > 0 && (
          <ul className="divide-y">
            {doses.map((dose) => (
              <li key={dose} className="flex items-center justify-between gap-2 py-2.5">
                <span className="flex items-center gap-1.5 text-heading font-extrabold tabular-nums">
                  {formatTime(dose)}
                  {isOvernightDose(dose) && (
                    <MoonIcon aria-label="Overnight" className="size-4 text-muted-foreground" />
                  )}
                </span>
                <span className="text-body-sm">
                  {istanbulDate(new Date(dose)) === TODAY ? 'Today' : formatShortDay(dose, TODAY)}
                </span>
              </li>
            ))}
          </ul>
        )
      ) : (
        <p className="pt-2 text-body-sm text-muted-foreground">They&apos;ll show here.</p>
      )}
      {lastDay && (
        <p className="pt-2 text-body-sm font-bold">No doses after {shortDay(lastDay)}.</p>
      )}
      {after && <p className="pt-2 text-body-sm text-muted-foreground">{CHANGE_KEEPS_EARLIER}</p>}
    </section>
  )
}

export type StopState = 'idle' | 'stopping' | 'unknown'

/** Stop schedule's confirm step: nothing saves until Stop schedule; the drawer holds while saving. */
export function StopScheduleDrawer({
  open: initiallyOpen = true,
  state = 'idle',
}: {
  open?: boolean
  state?: StopState
}) {
  const [open, setOpen] = useState(initiallyOpen)
  const pending = state === 'stopping'
  return (
    <Drawer open={open} onOpenChange={(next) => !pending && setOpen(next)}>
      <DrawerContent>
        <div className="-mt-2 flex flex-col gap-3" aria-busy={pending}>
          <DrawerHeader className="text-center">
            <DrawerTitle className="text-heading">Stop this schedule?</DrawerTitle>
          </DrawerHeader>
          <ul className="flex flex-col gap-2 text-body-sm text-muted-foreground">
            <li>Doses due so far, and any you&apos;ve logged, stay as they are.</li>
            <li>Meddies won&apos;t expect any more doses of {magnesium.label}.</li>
            <li>To start again, use Change schedule.</li>
          </ul>
          {state === 'unknown' && (
            <Alert variant="destructive">
              <AlertDescription>
                That might not have saved. Check your connection and try again.
              </AlertDescription>
            </Alert>
          )}
          <Button
            type="button"
            size="lg"
            variant="destructive"
            className="w-full"
            disabled={pending}
          >
            {pending ? 'Stopping…' : state === 'unknown' ? 'Retry' : 'Stop schedule'}
          </Button>
          <Button
            type="button"
            size="lg"
            variant="outline"
            className="w-full"
            disabled={pending}
            onClick={() => setOpen(false)}
          >
            Keep schedule
          </Button>
        </div>
      </DrawerContent>
    </Drawer>
  )
}
