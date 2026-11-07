import { InfoIcon } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { dateLabel } from '@/lib/calendar-date'
import { quantityLabel, type DoseUnit } from '@/lib/dose-quantity'
import { istanbulDate, type DoseOccurrence } from './contract'
import { doseClock } from './taken-form-schema'

type Recorded = Extract<DoseOccurrence, { status: 'Taken' | 'Skipped' }>

/** The drawer's recorded outcome line; an intake on another day names that day. */
export function RecordedOutcome({ dose, unit }: { dose: Recorded; unit: DoseUnit }) {
  if (dose.status === 'Skipped')
    return <p className="font-extrabold">Skipped. No intake recorded.</p>
  const taken = istanbulDate(new Date(dose.record.takenAt))
  const due = istanbulDate(new Date(dose.dueAt))
  return (
    <p className="font-extrabold">
      Taken {quantityLabel(dose.record.quantity, unit)} at{' '}
      <time dateTime={dose.record.takenAt}>{doseClock(dose.record.takenAt)}</time>
      {taken !== due && ` on ${dateLabel(taken, due)}`}
    </p>
  )
}

/** FE-648 F8: a refresh found a record made elsewhere while the form was open. */
export function RecordedElsewhere({ dose }: { dose: Recorded }) {
  return (
    <Alert role="status">
      <InfoIcon aria-hidden="true" />
      <AlertDescription className="text-foreground">
        This dose was recorded as {dose.status.toLowerCase()}
        {dose.status === 'Taken' && ` at ${doseClock(dose.record.takenAt)}`} while your form was
        open. Your draft is still here. Review the outcome before saving.
      </AlertDescription>
    </Alert>
  )
}
