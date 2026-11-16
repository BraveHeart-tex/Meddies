'use client'

import { Plus } from 'lucide-react'
import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Field, FieldLabel } from '@/components/ui/field'
import { TimePicker } from '@/components/ui/time-picker'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import {
  IntervalRow,
  IntervalSheet,
  ScheduleSetupHeader,
} from '@/features/schedules/interval-setup-parts'
import { NOW } from '../lab-fixtures'
import {
  amountErrors,
  amountLabel,
  examples,
  type LabType,
  type SharedState,
} from './medication-types-model'
import { AmountField, HistoryScreen, TodayScreen } from './medication-types-parts'
import { DoseDrawer } from './medication-types-drawers'

const noop = () => {}
const clockNow = () => new Date(NOW)

export function SharedScreen({ state }: { state: SharedState }) {
  switch (state) {
    case 'clock-edit':
      return (
        <ClockPage
          type="drops"
          subtitle="Change schedule"
          rows={[
            ['08:00', '1'],
            ['20:00', '2'],
          ]}
        />
      )
    case 'interval-setup':
      return <IntervalPage />
    case 'taken-change':
      return (
        <>
          <TodayScreen />
          <DoseDrawer
            type="inhaler"
            title="Salbutamol"
            description="Taken at 08:00 · 2 puffs"
            when="scheduled"
            amount="1"
            save="Save changes"
          />
        </>
      )
    case 'unscheduled':
      return (
        <>
          <TodayScreen />
          <DoseDrawer
            type="drops"
            title="Eye drops"
            description="Not on a schedule"
            amount="0"
            error={amountErrors.dropsMin}
            save="Save as taken"
            unscheduled
          />
        </>
      )
    case 'today':
      return <TodayScreen />
    case 'history':
      return <HistoryScreen />
  }
}

function SetupPage({
  label,
  subtitle,
  children,
}: {
  label: string
  subtitle: string
  children: ReactNode
}) {
  return (
    <div className="min-h-dvh bg-background [overflow-wrap:anywhere]">
      <div className="mx-auto flex max-w-2xl flex-col gap-5 px-5 pt-3.5 pb-6">
        <ScheduleSetupHeader label={label} subtitle={subtitle} onCancel={noop} />
        {children}
        <Button size="lg" className="w-full">
          Save schedule
        </Button>
      </div>
    </div>
  )
}

function KindChoice({ value }: { value: 'times' | 'interval' }) {
  return (
    <ToggleGroup variant="outline" className="w-full" defaultValue={[value]} aria-label="How often">
      <ToggleGroupItem value="times" className="flex-1">
        Set times
      </ToggleGroupItem>
      <ToggleGroupItem value="interval" className="flex-1">
        Every few hours
      </ToggleGroupItem>
    </ToggleGroup>
  )
}

function ClockPage({
  type,
  subtitle,
  rows,
}: {
  type: LabType
  subtitle: string
  rows: [time: string, amount: string, error?: string][]
}) {
  const example = Object.values(examples).find((item) => item.type === type)!
  return (
    <SetupPage label={example.label} subtitle={subtitle}>
      <KindChoice value="times" />
      {rows.map(([time, amount, error], index) => (
        <div
          key={time}
          className="flex flex-col gap-3 rounded-xl border bg-card p-4 has-aria-invalid:border-destructive"
        >
          <Field>
            <FieldLabel htmlFor={`lab-time-${index}`}>Time {index + 1}</FieldLabel>
            <TimePicker
              id={`lab-time-${index}`}
              label={`Time ${index + 1}`}
              value={time}
              now={clockNow}
              onValueChange={noop}
            />
          </Field>
          <AmountField
            id={`lab-amount-${index}`}
            name={`Time ${index + 1} amount`}
            type={type}
            initial={amount}
            error={error}
          />
        </div>
      ))}
      <Button variant="outline" className="self-start">
        <Plus aria-hidden="true" data-icon="inline-start" />
        Add another time
      </Button>
    </SetupPage>
  )
}

function IntervalPage() {
  return (
    <>
      <SetupPage label="Salbutamol" subtitle="Set schedule">
        <KindChoice value="interval" />
        <ul className="divide-y rounded-xl border bg-card">
          <IntervalRow id="lab-every" label="Every" value="6 hours" onClick={noop} />
          <IntervalRow id="lab-starts" label="Starts" value="Today at 08:00" onClick={noop} />
          <IntervalRow
            id="lab-take"
            label="Amount"
            value={amountLabel(2, 'inhaler')}
            onClick={noop}
          />
        </ul>
      </SetupPage>
      <IntervalSheet open title="Amount" onCancel={noop} onDone={noop}>
        <AmountField
          id="lab-interval-amount"
          name="Amount"
          type="inhaler"
          initial="1.5"
          error={amountErrors.inhalerWhole}
        />
      </IntervalSheet>
    </>
  )
}
