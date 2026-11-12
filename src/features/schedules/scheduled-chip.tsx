'use client'

import { Clock, TriangleAlert } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Item, ItemActions, ItemContent, ItemMedia, ItemTitle } from '@/components/ui/item'
import { formatShortDay, formatTime } from '@/lib/calendar-date'
import { istanbulDate, type DoseOccurrence, type DoseOutcomeRecord } from './contract'
import { DoseStatusBadge } from './dose-status-badge'
import { useSchedulingClock } from './scheduling-clock'

/**
 * The drawer's scheduled time with live status (108·R1, R6): "Scheduled 08:00 today" or
 * "Scheduled 22:30 on Thu 5 Nov". The status follows Today's refreshes, so a due-time rollover
 * moves it without touching the form. While saving it reads "Saving · Taken"; an unconfirmed
 * save reads "Might not have saved" (110·D21). Renders inside the open drawer, after hydration.
 */
export function ScheduledChip({
  dose,
  today,
  savingOutcome,
  unconfirmed,
}: {
  dose: DoseOccurrence
  /** Istanbul today; read from the scheduling clock when omitted. */
  today?: string
  /** The outcome being saved, or null. */
  savingOutcome: DoseOutcomeRecord['outcome'] | null
  unconfirmed: boolean
}) {
  const clock = useSchedulingClock()
  const date = istanbulDate(new Date(dose.dueAt))
  const reference = today ?? istanbulDate(clock.now())
  return (
    <Item variant="muted" size="sm" className="rounded-md bg-muted px-3.5 py-3">
      <ItemMedia className="text-muted-foreground [&>svg]:size-4.5">
        <Clock aria-hidden="true" />
      </ItemMedia>
      <ItemContent>
        <ItemTitle className="text-body-sm font-bold text-muted-foreground">
          <span>
            Scheduled{' '}
            <time dateTime={dose.dueAt} className="font-extrabold text-foreground">
              {formatTime(dose.dueAt)}{' '}
              {date === reference ? 'today' : `on ${formatShortDay(date, reference)}`}
            </time>
          </span>
        </ItemTitle>
      </ItemContent>
      <ItemActions>
        {savingOutcome ? (
          <Badge variant="pending">Saving · {savingOutcome}</Badge>
        ) : unconfirmed ? (
          <Badge variant="unconfirmed">
            <TriangleAlert aria-hidden="true" />
            Might not have saved
          </Badge>
        ) : (
          <DoseStatusBadge status={dose.status} />
        )}
      </ItemActions>
    </Item>
  )
}
