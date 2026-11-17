import { Calendar, Check } from 'lucide-react'
import { formatShortDay, formatTime } from '@/lib/calendar-date'
import { cn } from '@/lib/utils'
import { istanbulDate, type DoseOccurrence, type Today } from './contract'

/** The empty day's sentence for the next dose (docs/copy.md), shared by the done-for-today line. */
export const nextDoseSentence = (
  next: DoseOccurrence,
  date: string,
  name: (medicineId: string) => string,
) =>
  `Next is ${name(next.medicineId)} on ${formatShortDay(next.dueAt, date)} at ${formatTime(next.dueAt)}.`

const unresolved = (dose: DoseOccurrence) =>
  dose.status === 'Due now' || dose.status === 'Not logged'

/**
 * The done-for-today line (#373 direction B, 373·B1-B4): takes the Up next hero's slot once Today
 * lists doses but none is left to feature today, aligned with the list headings. Never while a
 * dose due today is unresolved or Scheduled, and not at all with rows in To log and no next dose.
 * It swaps in for the hero at once, with no exit motion. Plain text: no button, link, heading or
 * live region; the save message announces the last log.
 */
export function DoneTodayLine({
  today: { doses, upNext, next, date },
  name,
}: {
  today: Today
  name: (medicineId: string) => string
}) {
  if (upNext || doses.length === 0) return null
  const open = (dose: DoseOccurrence) => unresolved(dose) || dose.status === 'Upcoming'
  if (doses.some((dose) => open(dose) && istanbulDate(new Date(dose.dueAt)) === date)) return null
  // "All logged for today" only while To log is empty.
  const allLogged = !doses.some(unresolved)
  if (!allLogged && !next) return null
  return (
    <div className="flex items-start gap-2.5 px-1 wrap-anywhere">
      {/* Taken's check while To log is empty, otherwise the empty day's calendar. */}
      <span
        aria-hidden="true"
        className={cn(
          'grid size-6.5 shrink-0 place-items-center rounded-full [&>svg]:size-3.5',
          allLogged ? 'bg-dose-taken text-dose-taken-foreground' : 'bg-muted text-muted-foreground',
        )}
      >
        {allLogged ? <Check /> : <Calendar />}
      </span>
      <div className="flex min-w-0 flex-col gap-0.5 pt-0.5 text-body-sm">
        {allLogged && <p className="font-bold">All logged for today</p>}
        {next && <p className="text-muted-foreground">{nextDoseSentence(next, date, name)}</p>}
      </div>
    </div>
  )
}
