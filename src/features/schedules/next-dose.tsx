import { MedicationTile } from '@/features/medicines/medication-tile'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Icon } from '@/components/ui/icon'
import type { Medicine } from '@/features/medicines/contract'
import { istanbulDate, type DoseOccurrence } from './contract'
import { doseClock as clock } from './taken-form'
import type { PendingDose } from './use-dose-outcome-mutation'
import { DoseStatusBadge } from './dose-status-badge'

export function formatDayLabel(instant: string) {
  if (!instant) return undefined
  const part = (options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Istanbul', ...options }).format(
      new Date(instant),
    )
  return `${part({ weekday: 'long' })}, ${part({ day: 'numeric', month: 'long' })}`
}

export function greeting(instant: string) {
  if (!instant) return 'Today'
  const hour = Number(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Istanbul',
      hour: '2-digit',
      hourCycle: 'h23',
    }).format(new Date(instant)),
  )
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
    <Card variant="accent" className="gap-4 [overflow-wrap:break-word]">
      <CardHeader className="flex flex-wrap items-center justify-between gap-2">
        <CardTitle className="text-label leading-none tracking-eyebrow text-accent-foreground uppercase">
          <h3>Up next</h3>
        </CardTitle>
        <CardAction className="col-auto row-auto self-center justify-self-auto">
          <DoseStatusBadge pending={pending} status={dose.status} />
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center gap-3.5">
        <MedicationTile medicineId={dose.medicineId} size="lg" onAccent />
        <div className="flex min-w-[min(100%,8rem)] flex-1 flex-col gap-0.75">
          <p className="text-title font-extrabold">{name}</p>
          <p className="text-body-sm text-secondary-foreground">
            {[medicine?.strength, doseText].filter(Boolean).join(' · ')} · due{' '}
            <time dateTime={dose.dueAt}>{clock(dose.dueAt)}</time>
            {dueDate !== date ? ` on ${dueDate}` : ''}
          </p>
        </div>
      </CardContent>
      {onRecord && (
        <CardContent className="flex flex-wrap gap-2.5">
          <Button
            size="lg"
            className="min-w-[min(100%,7rem)] flex-1"
            aria-label={`Record ${name} at ${clock(dose.dueAt)} as taken`}
            onClick={() => onRecord('Taken')}
          >
            <Icon name="check" data-icon="inline-start" />
            Taken
          </Button>
          <Button
            size="lg"
            variant="outline"
            className="w-28 max-w-full border-transparent"
            aria-label={`Record ${name} at ${clock(dose.dueAt)} as skipped`}
            onClick={() => onRecord('Skipped')}
          >
            Skip
          </Button>
        </CardContent>
      )}
    </Card>
  )
}
