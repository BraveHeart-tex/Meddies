'use client'

import { useState, type ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { QuantityStepper } from '@/components/quantity-stepper'
import { DatePicker } from '@/components/ui/date-picker'
import { Field, FieldDescription, FieldError, FieldLabel, FieldTitle } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { TimePicker } from '@/components/ui/time-picker'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { ScheduleForm } from '@/features/schedules/schedule-form'
import { shiftDate } from '@/lib/calendar-date'
import { magnesium, TODAY, type IntervalDraft } from './interval-lab-model'

const fieldError = (message: string | undefined) => (message ? { message } : undefined)
const HOUR_PRESETS = ['4', '6', '8', '12', '24']
const TOMORROW = shiftDate(TODAY, 1)

/** The set-up screen for one medication, a full-screen modal that covers the tabs. */
export function SetupFrame({
  kind = 'interval',
  header,
  children,
}: {
  kind?: 'times' | 'interval'
  header: ReactNode
  children: ReactNode
}) {
  const [client] = useState(() => new QueryClient())
  const [current, setCurrent] = useState(kind)
  const content = (
    <section
      aria-labelledby="schedule-heading"
      className="flex flex-1 flex-col gap-5 [overflow-wrap:anywhere]"
    >
      {header}
      {current === 'times' && (
        <p className="text-body-sm text-muted-foreground">
          Times are Istanbul time. Doses start from the next time after you save. Earlier times
          today aren&apos;t added.
        </p>
      )}
      <Field>
        <FieldTitle
          id="schedule-kind-label"
          className="text-body-sm font-bold text-muted-foreground"
        >
          When do you take it?
        </FieldTitle>
        <ToggleGroup
          variant="outline"
          spacing={1.5}
          className="grid w-full grid-cols-2"
          aria-labelledby="schedule-kind-label"
          value={[current]}
          onValueChange={(next) => {
            const choice = next[0] as 'times' | 'interval' | undefined
            if (choice) setCurrent(choice)
          }}
        >
          <ToggleGroupItem value="times">Set times</ToggleGroupItem>
          <ToggleGroupItem value="interval">Every few hours</ToggleGroupItem>
        </ToggleGroup>
      </Field>
      {current === 'times' ? (
        <ScheduleForm medicine={magnesium} today={TODAY} onSaved={() => {}} onConflict={() => {}} />
      ) : (
        children
      )}
    </section>
  )
  return (
    <QueryClientProvider client={client}>
      <main className="mx-auto flex min-h-svh max-w-2xl flex-col px-5 pt-[calc(0.875rem+env(safe-area-inset-top,0px))]">
        {content}
      </main>
    </QueryClientProvider>
  )
}

export function HoursField({ draft }: { draft: IntervalDraft }) {
  const { hours } = draft.values
  const isPreset = HOUR_PRESETS.includes(hours)
  const [custom, setCustom] = useState(hours !== '' && !isPreset)
  const selected = custom ? 'other' : isPreset ? hours : null
  const error = draft.errors.hours
  return (
    <Field data-invalid={Boolean(error)}>
      <FieldTitle id="interval-hours-title" className="sr-only">
        Hours between doses
      </FieldTitle>
      <ToggleGroup
        variant="outline"
        spacing={1.5}
        className="grid w-full grid-cols-3"
        aria-labelledby="interval-hours-title"
        aria-describedby={error ? 'interval-hours-error' : undefined}
        value={selected ? [selected] : []}
        onValueChange={(next) => {
          const choice = next[0]
          if (!choice) return
          setCustom(choice === 'other')
          draft.update({ hours: choice === 'other' ? '' : choice })
        }}
      >
        {HOUR_PRESETS.map((preset) => (
          <ToggleGroupItem key={preset} value={preset}>
            {preset} hours
          </ToggleGroupItem>
        ))}
        <ToggleGroupItem value="other">Other</ToggleGroupItem>
      </ToggleGroup>
      {custom && (
        <div className="flex flex-col gap-1.5">
          <FieldLabel htmlFor="interval-hours">Exact hours</FieldLabel>
          <div className="flex min-w-0 items-center gap-2">
            <Input
              id="interval-hours"
              inputMode="numeric"
              autoComplete="off"
              enterKeyHint="done"
              className="w-20 shrink-0 text-center font-extrabold"
              value={hours}
              onChange={(event) => draft.update({ hours: event.target.value })}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? 'interval-hours-error' : 'interval-hours-help'}
            />
            <span className="font-bold text-muted-foreground">
              {hours === '1' ? 'hour' : 'hours'}
            </span>
          </div>
          <FieldDescription id="interval-hours-help">Whole hours, from 1 to 24.</FieldDescription>
        </div>
      )}
      <FieldError id="interval-hours-error" errors={[fieldError(error)]} />
    </Field>
  )
}

export function FirstDateField({ draft }: { draft: IntervalDraft }) {
  const { date } = draft.values
  const [other, setOther] = useState(date !== TODAY && date !== TOMORROW)
  const selected = other ? 'other' : date === TODAY ? 'today' : 'tomorrow'
  const error = draft.errors.date
  return (
    <Field data-invalid={Boolean(error)}>
      <FieldTitle id="interval-date-title">First date</FieldTitle>
      <ToggleGroup
        variant="outline"
        spacing={1.5}
        className="grid w-full grid-cols-3"
        aria-labelledby="interval-date-title"
        value={[selected]}
        onValueChange={(next) => {
          const choice = next[0]
          if (!choice) return
          setOther(choice === 'other')
          if (choice === 'today') draft.update({ date: TODAY })
          if (choice === 'tomorrow') draft.update({ date: TOMORROW })
        }}
      >
        <ToggleGroupItem value="today">Today</ToggleGroupItem>
        <ToggleGroupItem value="tomorrow">Tomorrow</ToggleGroupItem>
        <ToggleGroupItem value="other">Other</ToggleGroupItem>
      </ToggleGroup>
      {other && (
        <DatePicker
          id="interval-date"
          label="First date"
          today={TODAY}
          min={TODAY}
          max="2099-12-31"
          value={date}
          onValueChange={(value) => draft.update({ date: value })}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? 'interval-date-error' : undefined}
        />
      )}
      <FieldError id="interval-date-error" errors={[fieldError(error)]} />
    </Field>
  )
}

export function FirstTimeField({ draft }: { draft: IntervalDraft }) {
  const error = draft.errors.time
  return (
    <Field data-invalid={Boolean(error)}>
      <FieldLabel htmlFor="interval-time">First time</FieldLabel>
      <TimePicker
        id="interval-time"
        label="First time"
        value={draft.values.time}
        onValueChange={(time) => draft.update({ time })}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? 'interval-time-error interval-time-help' : 'interval-time-help'}
      />
      <FieldDescription id="interval-time-help">
        It can be earlier today. Doses count forward from this time.
      </FieldDescription>
      <FieldError id="interval-time-error" errors={[fieldError(error)]} />
    </Field>
  )
}

export function QuantityField({ draft }: { draft: IntervalDraft }) {
  return (
    <Field>
      <FieldLabel htmlFor="interval-quantity">Quantity</FieldLabel>
      <QuantityStepper
        id="interval-quantity"
        label="Quantity"
        unit={magnesium.unit}
        value={draft.values.quantity}
        onValueChange={(quantity) => draft.update({ quantity })}
        aria-describedby="interval-quantity-help"
      />
      <FieldDescription id="interval-quantity-help">
        Quantity is how much you take each time, not the strength on the pack.
      </FieldDescription>
    </Field>
  )
}
