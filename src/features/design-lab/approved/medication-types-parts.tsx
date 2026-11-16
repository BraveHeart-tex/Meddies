'use client'

import { Minus, Plus } from 'lucide-react'
import { useState } from 'react'
import { AppHeader } from '@/components/layout/app-header'
import { AppShell } from '@/components/layout/app-shell'
import { ScreenStack } from '@/components/layout/screen-stack'
import { Item, ItemContent, ItemDescription, ItemTitle } from '@/components/ui/item'
import { DoseStatusBadge } from '@/features/schedules/dose-status-badge'
import { Button } from '@/components/ui/button'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import {
  amountLabel,
  examples,
  formatAmount,
  typeRules,
  unitWord,
  type LabType,
} from './medication-types-model'

/**
 * QuantityStepper with the #265 rule per type: Liquid steps by 0.1 ml with decimal wording,
 * puffs and drops by one. Typing stays allowed; the unit word follows the number.
 */
export function AmountStepper({
  id,
  label,
  type,
  initial,
  error,
  grow = false,
}: {
  id: string
  label: string
  type: LabType
  initial: string
  error?: string
  /** Fill the row: Clock time rows and the Interval Amount sheet. */
  grow?: boolean
}) {
  const [text, setText] = useState(initial)
  const { step } = typeRules[type]
  const parsed = text.trim() ? Number(text.replace(',', '.').replace('½', '.5')) : null
  const number = parsed === null || Number.isNaN(parsed) ? null : parsed
  const move = (direction: 1 | -1) => {
    const units = Math.round(((number ?? step) / step) * 1000) / 1000
    const next = (direction === 1 ? Math.floor(units) + 1 : Math.ceil(units) - 1) * step
    setText(formatAmount(Math.max(step, next), type))
  }
  return (
    <div className="flex min-w-0 items-center gap-2">
      <Button
        type="button"
        variant="secondary"
        size="icon"
        aria-label={`Fewer: ${label}`}
        aria-controls={id}
        disabled={number !== null && number <= step}
        onClick={() => move(-1)}
      >
        <Minus aria-hidden="true" data-icon="inline-start" />
      </Button>
      <Input
        id={id}
        inputMode="decimal"
        autoComplete="off"
        className={cn('text-center font-extrabold', grow ? 'min-w-0 flex-1' : 'w-20 shrink-0')}
        value={text}
        onChange={(event) => setText(event.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={[`${id}-unit`, error && `${id}-error`].filter(Boolean).join(' ')}
      />
      <Button
        type="button"
        variant="secondary"
        size="icon"
        aria-label={`More: ${label}`}
        aria-controls={id}
        onClick={() => move(1)}
      >
        <Plus aria-hidden="true" data-icon="inline-start" />
      </Button>
      <span
        id={`${id}-unit`}
        className="font-bold text-muted-foreground"
        // Growing inputs keep one width per type whether the unit reads singular or plural.
        style={grow ? { minWidth: `${typeRules[type].plural.length + 0.5}ch` } : undefined}
      >
        {unitWord(number, type)}
      </span>
    </div>
  )
}

/** The dose drawer's Amount card: label left, stepper right, error under both. */
export function AmountCard({
  id,
  type,
  initial,
  error,
}: {
  id: string
  type: LabType
  initial: string
  error?: string
}) {
  return (
    <Field data-invalid={Boolean(error)} className="gap-2 rounded-lg border bg-card py-2 pr-2 pl-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <FieldLabel htmlFor={id} className="font-extrabold">
          Amount
        </FieldLabel>
        <AmountStepper id={id} label="Amount" type={type} initial={initial} error={error} />
      </div>
      {error && <FieldError id={`${id}-error`}>{error}</FieldError>}
    </Field>
  )
}

/** A labelled Amount field, as in a Clock time row or the Interval Amount sheet. */
export function AmountField({
  id,
  label = 'Amount',
  name,
  type,
  initial,
  error,
}: {
  id: string
  label?: string
  /** Accessible name, such as "Dose 1 amount". */
  name: string
  type: LabType
  initial: string
  error?: string
}) {
  return (
    <Field data-invalid={Boolean(error)}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <AmountStepper id={id} label={name} type={type} initial={initial} error={error} grow />
      {error && <FieldError id={`${id}-error`}>{error}</FieldError>}
    </Field>
  )
}

type Row = {
  time: string
  type: LabType
  meta: string
  status: 'Due now' | 'Upcoming' | 'Taken'
  at?: string
}

function DoseRows({ title, rows }: { title: string; rows: Row[] }) {
  return (
    <section className="flex flex-col gap-2.5">
      <h3 className="text-label font-extrabold tracking-eyebrow text-muted-foreground uppercase">
        {title} · {rows.length}
      </h3>
      <ul className="flex flex-col gap-2.5">
        {rows.map((row) => (
          <Item
            key={row.time + row.type}
            render={<li />}
            variant={row.status === 'Due now' ? 'attention' : 'card'}
            className="flex-wrap"
          >
            <span aria-hidden="true" className="w-11.5 shrink-0 font-extrabold">
              {row.time}
            </span>
            <ItemContent className="min-w-0 gap-0.75">
              <ItemTitle>{examples[row.type as keyof typeof examples]?.label}</ItemTitle>
              <ItemDescription>{row.meta}</ItemDescription>
            </ItemContent>
            <DoseStatusBadge status={row.status} time={row.at} />
          </Item>
        ))}
      </ul>
    </section>
  )
}

const strength = (type: keyof typeof examples) => examples[type].strength

export function TodayScreen() {
  return (
    <AppShell current="/">
      <ScreenStack>
        <AppHeader title="Today" />
        <DoseRows
          title="To log"
          rows={[
            {
              time: '08:00',
              type: 'liquid',
              meta: `${strength('liquid')} · ${amountLabel(5, 'liquid')}`,
              status: 'Due now',
            },
          ]}
        />
        <DoseRows
          title="Later today"
          rows={[
            {
              time: '14:00',
              type: 'inhaler',
              meta: `${strength('inhaler')} · ${amountLabel(2, 'inhaler')}`,
              status: 'Upcoming',
            },
            {
              time: '20:00',
              type: 'liquid',
              meta: `${strength('liquid')} · ${amountLabel(2.5, 'liquid')}`,
              status: 'Upcoming',
            },
          ]}
        />
        <DoseRows
          title="Logged"
          rows={[
            {
              time: '07:00',
              type: 'drops',
              meta: `${strength('drops')} · ${amountLabel(1, 'drops')} · took ${amountLabel(2, 'drops')}`,
              status: 'Taken',
              at: '07:05',
            },
          ]}
        />
      </ScreenStack>
    </AppShell>
  )
}

export function HistoryScreen() {
  return (
    <AppShell current="/history">
      <ScreenStack>
        <AppHeader title="History" />
        <h2 className="text-heading font-extrabold">Sunday, 8 November</h2>
        <DoseRows
          title="Logged"
          rows={[
            {
              time: '08:00',
              type: 'liquid',
              meta: `${strength('liquid')} · ${amountLabel(5, 'liquid')} · took ${amountLabel(4.5, 'liquid')}`,
              status: 'Taken',
              at: '08:10',
            },
            {
              time: '14:00',
              type: 'inhaler',
              meta: `${strength('inhaler')} · ${amountLabel(1, 'inhaler')}`,
              status: 'Taken',
              at: '14:02',
            },
            {
              time: '21:00',
              type: 'drops',
              meta: `${strength('drops')} · ${amountLabel(2, 'drops')}`,
              status: 'Taken',
              at: '21:00',
            },
          ]}
        />
        <section className="flex flex-col gap-2.5">
          <h3 className="text-label font-extrabold tracking-eyebrow text-muted-foreground uppercase">
            Not on a schedule · 1
          </h3>
          <Item variant="card">
            <span aria-hidden="true" className="w-11.5 shrink-0 font-extrabold">
              13:10
            </span>
            <ItemContent className="min-w-0 gap-0.75">
              <ItemTitle>Amoxicillin</ItemTitle>
              <ItemDescription>
                {strength('liquid')} · {amountLabel(0.5, 'liquid')}
              </ItemDescription>
            </ItemContent>
            <DoseStatusBadge status="Taken" time="13:10" />
          </Item>
        </section>
      </ScreenStack>
    </AppShell>
  )
}
