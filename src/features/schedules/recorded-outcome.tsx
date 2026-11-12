import { InfoIcon } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { formatShortDay, formatTime } from '@/lib/calendar-date'
import { quantityLabel, type DoseUnit } from '@/lib/dose-quantity'
import { istanbulDate, type DoseOccurrence } from './contract'

type Recorded = Extract<DoseOccurrence, { status: 'Taken' | 'Skipped' }>

/** The drawer's recorded outcome line; an intake on another day names that day. */
export function RecordedOutcome({
  dose,
  unit,
  today,
}: {
  dose: Recorded
  unit: DoseUnit
  today: string
}) {
  if (dose.status === 'Skipped')
    return <p className="font-extrabold">Skipped. Nothing recorded as taken.</p>
  const taken = istanbulDate(new Date(dose.record.takenAt))
  const due = istanbulDate(new Date(dose.dueAt))
  return (
    <p className="font-extrabold">
      Taken {quantityLabel(dose.record.quantity, unit)} at{' '}
      <time dateTime={dose.record.takenAt}>{formatTime(dose.record.takenAt)}</time>
      {taken !== due && ` on ${formatShortDay(taken, today)}`}
    </p>
  )
}

/** 648·F8: a refresh found a record made elsewhere while the form was open. */
export function RecordedElsewhere({ dose }: { dose: Recorded }) {
  return (
    <Alert role="status">
      <InfoIcon aria-hidden="true" />
      <AlertDescription className="text-foreground">
        This dose was saved as {dose.status.toLowerCase()}
        {dose.status === 'Taken' && ` at ${formatTime(dose.record.takenAt)}`} while your form was
        open. Your details are still here. Check what&apos;s saved before you save again.
      </AlertDescription>
    </Alert>
  )
}
