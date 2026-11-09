import { Check, Clock } from 'lucide-react'
import { MedicationTile } from '@/features/medicines/medication-tile'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatShortDay, formatTime, istanbulHour } from '@/lib/calendar-date'
import type { Medicine } from '@/features/medicines/contract'
import { istanbulDate, type DoseOccurrence } from './contract'
import type { PendingDose } from './dose-saves'

export function greeting(instant: string) {
  if (!instant) return 'Today'
  const hour = istanbulHour(instant)
  return hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'
}

export function NextDose({
  dose,
  pending,
  date,
  medicine,
  name,
  doseText,
  onRecord,
}: {
  pending?: PendingDose
  dose: DoseOccurrence
  date: string
  medicine?: Medicine
  name: string
  doseText: string
  onRecord?: (outcome: 'Taken' | 'Skipped') => void
}) {
  const dueDate = istanbulDate(new Date(dose.dueAt))
  return (
    <Card variant="accent" className="gap-4 [overflow-wrap:anywhere]">
      <CardHeader className="flex flex-wrap items-center justify-between gap-2">
        <CardTitle className="text-label leading-none tracking-eyebrow text-accent-foreground uppercase">
          <h3>Up next</h3>
        </CardTitle>
        <p className="flex flex-wrap items-center gap-1.5 text-label font-bold text-accent-foreground [&>svg]:size-3.5">
          <Clock aria-hidden="true" />
          <span>
            {pending
              ? pending.unconfirmed
                ? 'Might not have saved'
                : `Saving · ${pending.outcome}`
              : dose.status === 'Upcoming'
                ? 'Scheduled'
                : dose.status}{' '}
            · <time dateTime={dose.dueAt}>{formatTime(dose.dueAt)}</time>
            {dueDate !== date ? ` on ${formatShortDay(dueDate, date)}` : ''}
          </span>
        </p>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center gap-3.5">
        <MedicationTile medicineId={dose.medicineId} size="lg" onAccent />
        <div className="flex min-w-[min(100%,8rem)] flex-1 flex-col gap-0.75">
          <p className="text-title font-extrabold">{name}</p>
          <p className="text-body-sm text-secondary-foreground">
            {[medicine?.strength, doseText].filter(Boolean).join(' · ')}
          </p>
        </div>
      </CardContent>
      {onRecord && dueDate === date && (
        <CardContent className="flex flex-wrap gap-2.5">
          <Button
            size="lg"
            className="min-w-[min(100%,7rem)] flex-1"
            aria-label={`Record ${name} at ${formatTime(dose.dueAt)} as taken`}
            onClick={() => onRecord('Taken')}
          >
            <Check aria-hidden="true" data-icon="inline-start" />
            Taken
          </Button>
          <Button
            size="lg"
            variant="outline"
            className="w-28 max-w-full border-transparent"
            aria-label={`Record ${name} at ${formatTime(dose.dueAt)} as skipped`}
            onClick={() => onRecord('Skipped')}
          >
            Skip
          </Button>
        </CardContent>
      )}
    </Card>
  )
}
