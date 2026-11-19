'use client'
import { AlarmClock, Bell, BellOff } from 'lucide-react'
import Link from 'next/link'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button, buttonVariants } from '@/components/ui/button'
import { Item, ItemContent, ItemDescription, ItemMedia, ItemTitle } from '@/components/ui/item'
import { formatTime } from '@/lib/calendar-date'
import { saveMessages } from '@/lib/save-messages'
import { cn } from '@/lib/utils'
import type { DoseOccurrence } from '../schedules/contract'
import type { SnoozeRejection } from './contract'
import type { useSnooze } from './use-snooze'

export const snoozeRejectionCopy: Record<SnoozeRejection, string> = {
  notificationsOff: 'Turn on notifications to snooze.',
  exhausted: 'No reminders are left for this dose.',
  expired: "It's too late to snooze this dose.",
  pending: 'This dose is already snoozed.',
  quietHours: 'No reminder is left outside quiet hours.',
  logged: "This dose has changed. Check what's saved now.",
  paused: "This dose has changed. Check what's saved now.",
  superseded: "This dose has changed. Check what's saved now.",
  notDue: "This dose has changed. Check what's saved now.",
  notFound: "This dose has changed. Check what's saved now.",
}
export const snoozeNeedsReview = (reason: SnoozeRejection | undefined) =>
  !!reason && ['logged', 'paused', 'superseded', 'notDue', 'notFound'].includes(reason)

/** Approved 382·C2/C3: a status below the scheduled chip, never an intake receipt. */
export function SnoozeResultLine({ snooze }: { snooze: NonNullable<DoseOccurrence['snooze']> }) {
  const quiet = snooze.outcome === 'quietHours'
  return (
    <Item variant="muted" size="sm" role="status" className="rounded-md bg-muted px-3.5 py-3">
      <ItemMedia className="text-muted-foreground [&>svg]:size-4.5">
        {quiet ? <BellOff aria-hidden="true" /> : <Bell aria-hidden="true" />}
      </ItemMedia>
      <ItemContent>
        {quiet ? (
          <>
            <ItemTitle className="text-body-sm font-extrabold">No reminder</ItemTitle>
            <ItemDescription className="text-body-sm">
              {formatTime(snooze.targetAt)} is in quiet hours.
            </ItemDescription>
          </>
        ) : (
          <ItemTitle className="text-body-sm font-bold text-muted-foreground">
            <span>
              Reminder at{' '}
              <time dateTime={snooze.targetAt} className="font-extrabold text-foreground">
                {formatTime(snooze.targetAt)}
              </time>
            </span>
          </ItemTitle>
        )}
      </ItemContent>
    </Item>
  )
}
type State = ReturnType<typeof useSnooze>
export function SnoozeFeedback({ state }: { state: State }) {
  const { attempt, offline } = state
  if (attempt?.pending) return null
  const reason = attempt?.reason
  if (!reason && !attempt?.uncertain && !offline) return null
  return (
    <Alert variant={reason ? 'destructive' : 'default'}>
      {(reason || attempt?.uncertain) && (
        <AlertTitle>
          {attempt?.uncertain ? saveMessages.mightNotHaveSaved : saveMessages.notSaved}
        </AlertTitle>
      )}
      <AlertDescription>
        {offline && (attempt?.uncertain || reason === 'notificationsOff') && (
          <p>{"You're offline. Reconnect to snooze."}</p>
        )}
        {reason
          ? snoozeRejectionCopy[reason]
          : attempt?.uncertain
            ? 'Check your connection and try again with the same details.'
            : "You're offline. Reconnect to snooze."}
      </AlertDescription>
      {reason === 'notificationsOff' && (
        <Link
          href="/settings"
          className={cn(buttonVariants({ variant: 'outline' }), 'mt-2 justify-self-start')}
        >
          Open Settings
        </Link>
      )}
      {snoozeNeedsReview(reason) && (
        <Button
          type="button"
          variant="outline"
          className="mt-2 justify-self-start"
          onClick={() => void state.review()}
        >
          {saveMessages.checkWhatsSaved}
        </Button>
      )}
    </Alert>
  )
}
export function SnoozeButton({ state, context }: { state: State; context: string }) {
  const text = state.attempt?.pending
    ? 'Snoozing...'
    : state.offline
      ? 'Connect to snooze'
      : state.attempt?.uncertain
        ? 'Try snoozing again'
        : 'Snooze 40 min'
  const verb = state.offline
    ? 'Connect to snooze'
    : state.attempt?.uncertain
      ? 'Try snoozing again'
      : 'Snooze'
  return (
    <Button
      type="button"
      variant="outline"
      className="min-w-0"
      disabled={state.offline || state.attempt?.pending}
      aria-label={`${verb} dose for ${context}, 40 min`}
      onClick={() => void state.submit()}
    >
      <AlarmClock aria-hidden="true" data-icon="inline-start" />
      {text}
    </Button>
  )
}
