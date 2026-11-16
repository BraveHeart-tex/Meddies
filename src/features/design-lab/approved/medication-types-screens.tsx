'use client'

import { Plus, X } from 'lucide-react'
import type { ReactNode } from 'react'
import { AppShell } from '@/components/layout/app-shell'
import { ScreenStack } from '@/components/layout/screen-stack'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer'
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { TimePicker } from '@/components/ui/time-picker'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { MedicationsHeader } from '@/features/medicines/medications-header'
import { MedicationsScreen } from '@/features/medicines/medications-screen'
import {
  IntervalRow,
  IntervalSheet,
  ScheduleSetupHeader,
} from '@/features/schedules/interval-setup-parts'
import { FixtureQuery } from '../fixture-query'
import { NOW, routine } from '../lab-fixtures'
import {
  amountErrors,
  amountLabel,
  examples,
  typeRules,
  type AddState,
  type LabType,
  type SharedState,
} from './medication-types-model'
import { AmountField, HistoryScreen, TodayScreen } from './medication-types-parts'
import { DoseDrawer, TypeRow } from './medication-types-drawers'

const noop = () => {}
const clockNow = () => new Date(NOW)

// Inset rows from Add medication (medicine-form.tsx).
const textRow =
  'grid min-h-14 grid-cols-[5.75rem_minmax(0,1fr)] items-center gap-0 px-4 not-first:border-t has-[input:focus-visible]:outline-2 has-[input:focus-visible]:-outline-offset-2 has-[input:focus-visible]:outline-ring'
const rowInput =
  'h-auto min-h-14 rounded-none border-0 bg-transparent px-0 text-body-lg font-bold placeholder:font-semibold focus-visible:outline-none'
const rowHelp = 'col-span-full pb-3 text-caption'

/** Add medication over Medications: Name, Type, then Strength with the Type's help. */
export function AddMedicationScreen({ state }: { state: AddState }) {
  const type = state
  const name = examples[type].label
  const help = typeRules[type].help
  const nameRow = (
    <Field className={textRow}>
      <FieldLabel htmlFor="lab-name">Name</FieldLabel>
      <Input id="lab-name" defaultValue={name} placeholder="On your pack" className={rowInput} />
    </Field>
  )
  const strengthRow = (
    <Field className={textRow}>
      <FieldLabel htmlFor="lab-strength">Strength</FieldLabel>
      <Input
        id="lab-strength"
        placeholder="Optional"
        aria-describedby="lab-strength-help"
        className={rowInput}
      />
      <FieldDescription id="lab-strength-help" className={rowHelp}>
        {help}
      </FieldDescription>
    </Field>
  )
  const typeRow = <TypeRow type={type} open={false} />
  return (
    <FixtureQuery {...routine}>
      <AppShell current="/medications">
        <ScreenStack>
          <MedicationsHeader />
          <MedicationsScreen initialNow={NOW} serverEntry />
        </ScreenStack>
      </AppShell>
      <Drawer open>
        <DrawerContent>
          <div className="-mt-2 flex flex-col gap-3.5">
            <DrawerHeader className="-mx-2 -my-1 grid min-h-12 grid-cols-[2.75rem_minmax(0,1fr)_2.75rem] items-center gap-0 text-center">
              <DrawerClose
                render={<Button variant="ghost" size="icon" className="rounded-full" />}
                aria-label="Close"
              >
                <X aria-hidden="true" data-icon="inline-start" />
              </DrawerClose>
              <DrawerTitle className="text-heading">Add medication</DrawerTitle>
            </DrawerHeader>
            <Card className="gap-0 py-0">
              <FieldGroup className="gap-0">
                {nameRow}
                {typeRow}
                {strengthRow}
              </FieldGroup>
            </Card>
            <Button size="drawer" className="w-full">
              Save medication
            </Button>
          </div>
        </DrawerContent>
      </Drawer>
    </FixtureQuery>
  )
}

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
