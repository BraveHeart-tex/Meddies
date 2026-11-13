import { CalendarOff, TriangleAlert } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Item, ItemActions, ItemContent, ItemMedia, ItemTitle } from '@/components/ui/item'
import { formatShortDay, formatTime } from '@/lib/calendar-date'
import { DoseStatusBadge } from '../schedules/dose-status-badge'
import { takenDate, type UnscheduledDose } from './contract'

/**
 * The dose drawer's muted line in place of the Scheduled chip (241·A3, A8): "Not on a schedule",
 * with the saved dose's day and "Taken HH:MM" badge, or the save's live badge (241·S4, S5).
 */
export function NotOnScheduleChip({
  saving,
  unconfirmed,
  dose,
  today,
}: {
  saving: boolean
  unconfirmed: boolean
  /** The saved dose a change drawer opened. */
  dose?: UnscheduledDose
  today: string
}) {
  const date = dose ? takenDate(dose) : ''
  return (
    <Item variant="muted" size="sm" className="rounded-md bg-muted px-3.5 py-3">
      <ItemMedia className="text-muted-foreground [&>svg]:size-4.5">
        <CalendarOff aria-hidden="true" />
      </ItemMedia>
      <ItemContent>
        <ItemTitle className="text-body-sm font-bold text-muted-foreground">
          {dose ? (
            <span>
              Not on a schedule ·{' '}
              <time dateTime={dose.takenAt} className="font-extrabold text-foreground">
                {date === today ? 'today' : formatShortDay(date, today)}
              </time>
            </span>
          ) : (
            'Not on a schedule'
          )}
        </ItemTitle>
      </ItemContent>
      <ItemActions>
        {saving ? (
          <Badge variant="pending">Saving · Taken</Badge>
        ) : unconfirmed ? (
          <Badge variant="unconfirmed">
            <TriangleAlert aria-hidden="true" />
            Might not have saved
          </Badge>
        ) : dose ? (
          <DoseStatusBadge
            status="Taken"
            time={<time dateTime={dose.takenAt}>{formatTime(dose.takenAt)}</time>}
          />
        ) : null}
      </ItemActions>
    </Item>
  )
}
