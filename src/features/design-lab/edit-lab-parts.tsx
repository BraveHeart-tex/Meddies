'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Controller, useFieldArray, useForm, useWatch } from 'react-hook-form'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Field, FieldDescription, FieldTitle } from '@/components/ui/field'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import {
  IntervalFirstDateField,
  IntervalFirstTimeField,
  IntervalHoursField,
  IntervalQuantityField,
} from '@/features/schedules/interval-fields'
import {
  intervalHoursAnswer,
  IntervalRow,
  IntervalSheet,
  intervalStartsAnswer,
} from '@/features/schedules/interval-setup-parts'
import type {
  ScheduleFormOutput,
  ScheduleFormValues,
} from '@/features/schedules/schedule-form-schema'
import { ScheduleTimeRow } from '@/features/schedules/schedule-time-row'
import {
  SHORT_WEEKDAYS,
  WEEK_ORDER,
  WEEKDAY_NAMES,
  weekdaySummary,
} from '@/features/schedules/weekdays'
import { quantityLabel } from '@/lib/dose-quantity'
import { magnesium, NOW, TODAY } from './interval-lab-model'
import type { ClockValues, ScheduleKind } from './edit-lab-model'
import type { ScheduleEdit } from './use-schedule-edit'

export type SaveState = 'idle' | 'saving' | 'conflict'

/** Provides a per-frame Query client; no frame reads data from the network. */
export function LabData({ children }: { children: ReactNode }) {
  const [client] = useState(() => new QueryClient())
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

/** "When do you take it?", the setup's own kind choice (764·C0). */
export function KindToggle({
  value,
  onChange,
  disabled,
}: {
  value: ScheduleKind
  onChange: (kind: ScheduleKind) => void
  disabled?: boolean
}) {
  return (
    <Field>
      <FieldTitle id="schedule-kind-label" className="text-body-sm font-bold text-muted-foreground">
        When do you take it?
      </FieldTitle>
      <ToggleGroup
        variant="outline"
        spacing={1.5}
        className="grid w-full grid-cols-2"
        aria-labelledby="schedule-kind-label"
        disabled={disabled}
        value={[value]}
        onValueChange={(next) => {
          const choice = next[0] as ScheduleKind | undefined
          if (choice) onChange(choice)
        }}
      >
        <ToggleGroupItem value="times">Set times</ToggleGroupItem>
        <ToggleGroupItem value="interval">Every few hours</ToggleGroupItem>
      </ToggleGroup>
    </Field>
  )
}

/** The Clock schedule form without Start date: an edit always starts when it saves. */
export function ClockEditFields({
  value,
  onChange,
  disabled = false,
}: {
  value: ClockValues
  onChange: (next: ClockValues) => void
  disabled?: boolean
}) {
  const form = useForm<ScheduleFormValues, unknown, ScheduleFormOutput>({
    defaultValues: { startDate: TODAY, weekdays: value.weekdays, times: value.times },
  })
  const rows = useFieldArray({ control: form.control, name: 'times' })
  const report = useRef(onChange)
  useEffect(() => {
    report.current = onChange
  })
  const [weekdays, times] = useWatch({ control: form.control, name: ['weekdays', 'times'] })
  useEffect(() => {
    // Days in week order, so untapping and retapping one isn't a change.
    report.current({
      weekdays: [...weekdays].sort((a, b) => a - b),
      times: times.map((slot) => ({ time: slot.time, quantity: slot.quantity })),
    })
  }, [weekdays, times])
  return (
    <fieldset disabled={disabled} className="flex flex-col gap-5 disabled:opacity-70">
      <legend className="sr-only">Schedule for {magnesium.label}</legend>
      <Controller
        name="weekdays"
        control={form.control}
        render={({ field }) => (
          <Field>
            <FieldTitle id="edit-days-label">Days</FieldTitle>
            <ToggleGroup
              multiple
              variant="outline"
              size="sm"
              spacing={1.5}
              className="grid w-full grid-cols-4 min-[344px]:grid-cols-7"
              aria-labelledby="edit-days-label"
              aria-describedby="edit-days-summary"
              value={field.value.map(String)}
              onValueChange={(next) => field.onChange(next.map(Number))}
              disabled={disabled}
            >
              {WEEK_ORDER.map((day) => (
                <ToggleGroupItem
                  key={day}
                  value={String(day)}
                  aria-label={WEEKDAY_NAMES[day]}
                  className="min-w-0 px-0"
                >
                  {SHORT_WEEKDAYS[day]}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
            <FieldDescription id="edit-days-summary">
              {field.value.length ? weekdaySummary(field.value, 'short') : 'No days chosen'}
            </FieldDescription>
          </Field>
        )}
      />
      <FieldDescription id="quantity-help">
        Quantity is how much you take each time, not the strength on the pack.
      </FieldDescription>
      {rows.fields.map((row, index) => (
        <ScheduleTimeRow
          key={row.id}
          control={form.control}
          index={index}
          rowId={`edit-${index}`}
          unit={magnesium.unit}
          disabled={disabled}
          onTimeChange={() => {}}
          onRemove={rows.fields.length > 1 ? () => rows.remove(index) : undefined}
        />
      ))}
      <Button
        type="button"
        variant="outline"
        className="self-start"
        onClick={() => rows.append({ time: '', quantity: '1' })}
      >
        <Plus aria-hidden="true" data-icon="inline-start" />
        Add another time
      </Button>
    </fieldset>
  )
}

type Sheet = 'every' | 'starts' | 'take'
const SHEET_TITLES: Record<Sheet, string> = { every: 'Every', starts: 'Starts', take: 'Take' }

/** The Interval schedule rows (764·C1), prefilled; the Anchor stays unless Starts changes. */
export function IntervalEditRows({
  edit,
  disabled = false,
  error,
}: {
  edit: ScheduleEdit
  disabled?: boolean
  error?: string
}) {
  const { hours, date, time, quantity } = edit.interval
  const [sheet, setSheet] = useState<Sheet | null>(null)
  const [lastSheet, setLastSheet] = useState<Sheet>('every')
  const [snapshot, setSnapshot] = useState(edit.interval)
  const open = (next: Sheet) => {
    setSnapshot(edit.interval)
    setLastSheet(next)
    setSheet(next)
  }
  return (
    <>
      <ul className="divide-y rounded-xl border bg-card">
        <IntervalRow
          id="edit-every"
          label="Every"
          value={intervalHoursAnswer(hours)}
          disabled={disabled}
          onClick={() => open('every')}
        />
        <IntervalRow
          id="edit-starts"
          label="Starts"
          value={time ? intervalStartsAnswer(date, time, TODAY) : null}
          error={error}
          disabled={disabled}
          onClick={() => open('starts')}
        />
        <IntervalRow
          id="edit-take"
          label="Take"
          value={quantityLabel(Number(quantity) || 1, magnesium.unit)}
          disabled={disabled}
          onClick={() => open('take')}
        />
      </ul>
      <IntervalSheet
        open={sheet !== null}
        title={SHEET_TITLES[lastSheet]}
        onCancel={() => {
          edit.updateInterval(snapshot)
          setSheet(null)
        }}
        onDone={() => setSheet(null)}
      >
        {lastSheet === 'every' && (
          <>
            <IntervalHoursField
              value={hours}
              onChange={(next) => edit.updateInterval({ hours: next })}
            />
            <p className="text-center text-body-sm text-muted-foreground">
              A late dose doesn&apos;t move later times.
            </p>
          </>
        )}
        {lastSheet === 'starts' && (
          <>
            <IntervalFirstDateField
              today={TODAY}
              min={date && date < TODAY ? date : TODAY}
              value={date}
              onChange={(next) => edit.updateInterval({ date: next })}
            />
            <IntervalFirstTimeField
              value={time}
              onChange={(next) => edit.updateInterval({ time: next })}
            />
          </>
        )}
        {lastSheet === 'take' && (
          <IntervalQuantityField
            unit={magnesium.unit}
            value={quantity}
            onChange={(next) => edit.updateInterval({ quantity: next })}
          />
        )}
      </IntervalSheet>
    </>
  )
}

/** One Alert above one full-width primary action; nothing optimistic while saving. */
export function EditFooter({
  changed,
  state,
  onReview,
}: {
  changed: boolean
  state: SaveState
  onReview?: () => void
}) {
  if (state === 'conflict')
    return (
      <>
        <Alert id="schedule-save-problem" variant="destructive">
          <AlertTitle>This schedule changed while you were editing.</AlertTitle>
          <AlertDescription>
            Nothing here was saved. Review the current schedule, then make your change again.
          </AlertDescription>
        </Alert>
        <Button type="button" size="lg" className="w-full whitespace-normal" onClick={onReview}>
          Review current schedule
        </Button>
      </>
    )
  return (
    <Button
      type="button"
      size="lg"
      disabled={!changed || state === 'saving'}
      className="w-full whitespace-normal"
    >
      {state === 'saving' ? 'Saving changes...' : 'Save changes'}
    </Button>
  )
}
