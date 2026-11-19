'use client'

import { AlarmClock, Bell, BellOff } from 'lucide-react'
import Link from 'next/link'
import type { ReactNode } from 'react'
import { AppShell } from '@/components/layout/app-shell'
import { ScreenStack } from '@/components/layout/screen-stack'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button, buttonVariants } from '@/components/ui/button'
import { Item, ItemContent, ItemDescription, ItemMedia, ItemTitle } from '@/components/ui/item'
import type { Medicine } from '@/features/medicines/contract'
import type { DoseOccurrence } from '@/features/schedules/contract'
import { DoseDrawer } from '@/features/schedules/dose-drawer'
import { OutcomeChoice } from '@/features/schedules/outcome-choice'
import { ScheduledChip } from '@/features/schedules/scheduled-chip'
import { SchedulePanel } from '@/features/schedules/schedule-panel'
import { SchedulingClockProvider } from '@/features/schedules/scheduling-clock'
import { TodayHeader } from '@/features/schedules/today-header'
import { formatTime } from '@/lib/calendar-date'
import { saveMessages } from '@/lib/save-messages'
import { cn } from '@/lib/utils'
import { FixtureQuery } from '../fixture-query'
import { iron, salbutamol, TODAY } from '../lab-fixtures'
import {
  late,
  lateDose,
  lateTarget,
  morning,
  morningDose,
  morningReminder,
  snoozeCopy,
  type SnoozeState,
} from './snooze-model'

const noop = () => {}

/** Today (238·A1) with the dose drawer open on a Not logged dose. */
function DrawerOverToday({
  quiet,
  children,
}: {
  quiet: boolean
  children: (dose: DoseOccurrence) => ReactNode
}) {
  const fixtures = quiet ? late : morning
  const dose = quiet ? lateDose : morningDose
  const medicine: Medicine = quiet ? iron : salbutamol
  return (
    <FixtureQuery {...fixtures}>
      <AppShell current="/">
        <ScreenStack>
          <TodayHeader initialNow={fixtures.now} />
          <SchedulePanel mode="today" initialNow={fixtures.now} />
        </ScreenStack>
      </AppShell>
      <SchedulingClockProvider serverNow={fixtures.now}>
        <DoseDrawer
          open
          saving={false}
          triggerId="lab-snooze"
          type={medicine.unit}
          title={medicine.label}
          description={[medicine.strength, medicine.unit].filter(Boolean).join(' · ')}
          onClose={noop}
        >
          {children(dose)}
        </DoseDrawer>
      </SchedulingClockProvider>
    </FixtureQuery>
  )
}

function Chip({ dose }: { dose: DoseOccurrence }) {
  return <ScheduledChip dose={dose} today={TODAY} savingOutcome={null} unconfirmed={false} />
}

function Choice({ dose }: { dose: DoseOccurrence }) {
  return <OutcomeChoice doseId={dose.id} value={null} disabled={() => false} onChoose={noop} />
}

function Primary() {
  return (
    <Button type="button" size="drawer" className="w-full" disabled>
      Choose what happened
    </Button>
  )
}

function Cancel({ className = 'w-full' }: { className?: string }) {
  return (
    <Button type="button" variant="ghost" className={className}>
      Cancel
    </Button>
  )
}

function SnoozeButton({ className = 'w-full' }: { className?: string }) {
  return (
    <Button type="button" variant="outline" className={className}>
      <AlarmClock aria-hidden="true" data-icon="inline-start" />
      {snoozeCopy.action}
    </Button>
  )
}

/** The confirmed result, in the scheduled chip's muted style. */
function ResultLine({ state }: { state: 'snoozed' | 'quiet' }) {
  return (
    <Item variant="muted" size="sm" role="status" className="rounded-md bg-muted px-3.5 py-3">
      <ItemMedia className="text-muted-foreground [&>svg]:size-4.5">
        {state === 'snoozed' ? <Bell aria-hidden="true" /> : <BellOff aria-hidden="true" />}
      </ItemMedia>
      <ItemContent>
        {state === 'snoozed' ? (
          <ItemTitle className="text-body-sm font-bold text-muted-foreground">
            <span>
              Reminder at{' '}
              <time dateTime={morningReminder} className="font-extrabold text-foreground">
                {formatTime(morningReminder)}
              </time>
            </span>
          </ItemTitle>
        ) : (
          <>
            <ItemTitle className="text-body-sm font-extrabold">{snoozeCopy.quietTitle}</ItemTitle>
            <ItemDescription className="text-body-sm">
              {snoozeCopy.quietBody(formatTime(lateTarget))}
            </ItemDescription>
          </>
        )}
      </ItemContent>
    </Item>
  )
}

/** A rejected snooze: the shared "Not saved." alert with its reason; here, no device can notify. */
function Rejected() {
  return (
    <Alert variant="destructive">
      <AlertTitle>{saveMessages.notSaved}</AlertTitle>
      <AlertDescription>{snoozeCopy.rejected.notificationsOff}</AlertDescription>
      <Link
        href="/settings"
        className={cn(buttonVariants({ variant: 'outline' }), 'mt-2 justify-self-start')}
      >
        {snoozeCopy.settings}
      </Link>
    </Alert>
  )
}

/* 382·C1 to 382·C4, Snooze beside Cancel: Snooze shares a row with Cancel under the primary, and the result
   moves up under the scheduled chip, where reopening shows it first. Saving, offline and the other
   rejections reuse their existing patterns in Snooze's slot (snoozeCopy). */
function SnoozeDrawer({ dose, state }: { dose: DoseOccurrence; state: SnoozeState }) {
  const open = state === 'available' || state === 'rejected'
  return (
    <>
      <div className="flex flex-col gap-1.5">
        <Chip dose={dose} />
        {!open && <ResultLine state={state} />}
      </div>
      <Choice dose={dose} />
      <div className="flex flex-col gap-2.5">
        {state === 'rejected' && <Rejected />}
        <Primary />
        {open ? (
          <div className="grid grid-cols-2 gap-2.5">
            <Cancel className="min-w-0" />
            <SnoozeButton className="min-w-0" />
          </div>
        ) : (
          <Cancel />
        )}
      </div>
    </>
  )
}

export function SnoozeScreen({ state }: { state: SnoozeState }) {
  return (
    <DrawerOverToday quiet={state === 'quiet'}>
      {(dose) => <SnoozeDrawer dose={dose} state={state} />}
    </DrawerOverToday>
  )
}
