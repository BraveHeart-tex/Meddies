'use client'

import { AppHeader } from '@/components/layout/app-header'
import { AppShell } from '@/components/layout/app-shell'
import { ScreenStack } from '@/components/layout/screen-stack'
import { Item, ItemContent, ItemDescription, ItemTitle } from '@/components/ui/item'
import { DoseStatusBadge } from '@/features/schedules/dose-status-badge'
import { amountLabel, examples, type LabType } from './medication-types-model'

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
