'use client'
import Link from 'next/link'
import type { ReactNode } from 'react'
import { Archive, Clock, History, Pencil } from 'lucide-react'
import { AppShell } from '@/components/layout/app-shell'
import { AppHeader } from '@/components/layout/app-header'
import { ScreenStack } from '@/components/layout/screen-stack'
import { Badge } from '@/components/ui/badge'
import { Button, buttonVariants } from '@/components/ui/button'
import { Item, ItemContent, ItemDescription, ItemGroup, ItemTitle } from '@/components/ui/item'
import { Skeleton } from '@/components/ui/skeleton'
import { MedicationBackRow, MedicationIdentity } from '@/features/medicines/medication-sub-screen'
import { recordExample, type RecordState } from './medication-record-model'
import { Heading, NavigationRow, Notice } from './medication-record-parts'
import { EditForm } from './medication-record-forms'
import { ConfirmDrawer, LateDrawer } from './medication-record-drawers'
const medicine = recordExample.medicine
const frameLink = (slug: string) => `/lab/${slug}`

function Detail({
  saved = false,
  restored = false,
  archived = false,
}: {
  saved?: boolean
  restored?: boolean
  archived?: boolean
}) {
  return (
    <>
      <MedicationBackRow href={frameLink('238-a2')}>
        {archived ? 'Archived medications' : 'Medications'}
      </MedicationBackRow>
      <MedicationIdentity medicine={saved ? { ...medicine, strength: '600 mg' } : medicine} />
      {(saved || restored) && (
        <Notice title={restored ? 'Magnesium restored' : 'Strength change saved'}>
          {restored
            ? 'No schedule has restarted. Set one when you’re ready.'
            : '600 mg from Mon 9 Nov at 09:30. Earlier doses keep their saved strength.'}
        </Notice>
      )}
      {archived ? (
        <>
          <Badge variant="secondary">
            <Archive aria-hidden="true" />
            Archived
          </Badge>
          <Notice title="Kept in History">
            The schedule has stopped. Reminders are cancelled. Stock is unchanged.
          </Notice>
          <Link href={frameLink('292-s8')} className={buttonVariants({ size: 'lg' })}>
            Restore medication
          </Link>
        </>
      ) : (
        <>
          <Item variant="card">
            <ItemContent>
              <ItemTitle>{restored ? 'No schedule' : 'Every day'}</ItemTitle>
              <ItemDescription>
                {restored ? 'Log a dose whenever you take one.' : '08:00 and 20:00 · 1 tablet'}
              </ItemDescription>
            </ItemContent>
          </Item>
          {restored && (
            <>
              <Button size="lg">Log a dose</Button>
              <Button variant="outline">Set schedule</Button>
            </>
          )}
          <Heading>Medication details</Heading>
          <ItemGroup>
            <NavigationRow
              href={frameLink('238-a3')}
              title="Fix a mistake"
              description="Fix details that were entered wrongly."
              icon={Pencil}
            />
            <NavigationRow
              href={frameLink('238-a3')}
              title="Change strength"
              description="Record a different strength you take now."
              icon={Clock}
            />
          </ItemGroup>
        </>
      )}
      <ItemGroup>
        <NavigationRow
          href={frameLink('238-a3')}
          title="Strength history"
          description="See which strength each period uses."
          icon={History}
        />
      </ItemGroup>
      {!archived && (
        <Link href={frameLink('292-s5')} className={buttonVariants({ variant: 'ghost' })}>
          <Archive data-icon="inline-start" />
          Archive medication
        </Link>
      )}
    </>
  )
}

function StrengthHistory() {
  return (
    <>
      <MedicationBackRow href={frameLink('238-a3')}>Magnesium</MedicationBackRow>
      <MedicationIdentity medicine={medicine} />
      <Heading description="A dose keeps the strength from when it was taken. Fix a mistake in the period that needs it.">
        Strength history
      </Heading>
      <ItemGroup>
        <NavigationRow
          title="400 mg · Current"
          description="From Mon 9 Nov at 09:00. Fix a mistake in this period."
          href={frameLink('238-a3')}
          icon={Pencil}
        />
        <NavigationRow
          title="200 mg"
          description="Mon 2 Nov to Mon 9 Nov at 09:00. Fix a mistake in this period."
          href={frameLink('238-a3')}
          icon={Pencil}
        />
      </ItemGroup>
      <Notice>
        Fixing a mistake updates doses from that period. Taking a new strength keeps earlier doses
        as they are.
      </Notice>
    </>
  )
}

/** #292 exploration only. Save and transport states are fixed examples, never live writes. */
export function MedicationRecordScreen({ state }: { state: RecordState }) {
  let content: ReactNode
  if (
    [
      'fix',
      'strength',
      'revision',
      'unused',
      'invalid',
      'saving',
      'offline',
      'failure',
      'uncertain',
      'conflict',
    ].includes(state)
  )
    content = (
      <EditForm
        strength={state === 'strength' || state === 'invalid' || state === 'saving'}
        state={state}
      />
    )
  else if (state === 'history') content = <StrengthHistory />
  else if (state === 'loading')
    content = (
      <>
        <MedicationBackRow href={frameLink('238-a2')}>Medications</MedicationBackRow>
        <AppHeader title="Medication" />
        <div role="status" aria-label="Loading medication" className="flex flex-col gap-5">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      </>
    )
  else if (state === 'load-error')
    content = (
      <>
        <MedicationBackRow href={frameLink('238-a2')}>Medications</MedicationBackRow>
        <AppHeader title="Medication" />
        <Notice warning title="This medication didn’t load just now">
          Check your connection and try again.
        </Notice>
        <Button variant="outline">Try loading medication again</Button>
      </>
    )
  else
    content = (
      <Detail
        archived={state === 'restore'}
        saved={state === 'saved'}
        restored={state === 'restored'}
      />
    )
  return (
    <AppShell current="/medications">
      <ScreenStack>{content}</ScreenStack>
      {(state === 'archive' || state === 'restore' || state === 'discard') && (
        <ConfirmDrawer state={state} />
      )}
      {state === 'late' && <LateDrawer />}
    </AppShell>
  )
}
