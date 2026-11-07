'use client'

import { Badge } from '@/components/ui/badge'
import { Icon } from '@/components/ui/icon'
import { Item, ItemActions, ItemContent, ItemMedia, ItemTitle } from '@/components/ui/item'
import { dateLabel } from '@/lib/calendar-date'
import { istanbulDate, type DoseOccurrence, type DoseOutcomeRecord } from './contract'
import { DoseStatusBadge } from './dose-status-badge'
import { useSchedulingClock } from './scheduling-clock'
import { doseClock } from './taken-form-schema'

/**
 * The drawer's scheduled time with live status (FE-648 R1, R6): "Scheduled 08:00 today" or
 * "Scheduled 22:30 on Thu 5 Nov". The status follows Today's refreshes, so a due-time rollover
 * moves it without touching the form. While saving it reads "Saving · Taken"; an unconfirmed
 * save reads "Not confirmed" (FE-650 D21). Renders inside the open drawer, after hydration.
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
      <ItemMedia className="text-muted-foreground">
        <Icon name="clock" size={18} />
      </ItemMedia>
      <ItemContent>
        <ItemTitle className="text-body-sm font-bold text-muted-foreground">
          <span>
            Scheduled{' '}
            <time dateTime={dose.dueAt} className="font-extrabold text-foreground">
              {doseClock(dose.dueAt)}{' '}
              {date === reference ? 'today' : `on ${dateLabel(date, reference)}`}
            </time>
          </span>
        </ItemTitle>
      </ItemContent>
      <ItemActions>
        {savingOutcome ? (
          <Badge variant="pending">Saving · {savingOutcome}</Badge>
        ) : unconfirmed ? (
          <Badge variant="unconfirmed">
            <Icon name="warning" size={13} />
            Not confirmed
          </Badge>
        ) : (
          <DoseStatusBadge status={dose.status} />
        )}
      </ItemActions>
    </Item>
  )
}
