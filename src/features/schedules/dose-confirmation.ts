import { dateLabel } from '@/lib/calendar-date'
import { quantityLabel, type DoseUnit } from '@/lib/dose-quantity'
import { istanbulDate, type DoseOccurrence, type DoseOutcomeRecord } from './contract'
import { doseClock } from './taken-form-schema'

/**
 * The confirmation toast after a server-confirmed save (FE-648 F2, C5), for example
 * 'Melatonin 22:30 · updated to taken at 23:00 on Thu 5 Nov, ½ tablet'. The scheduled time never
 * changes; an intake on another day than scheduled names that day.
 */
export function outcomeConfirmation({
  label,
  unit,
  previous,
  record,
}: {
  label: string
  unit: DoseUnit
  /** The dose's status before this save. */
  previous: DoseOccurrence['status']
  record: DoseOutcomeRecord
}) {
  const head = `${label} ${doseClock(record.dueAt)} ·`
  const corrected = previous === 'Taken' || previous === 'Skipped'
  if (record.outcome === 'Skipped')
    return `${head} ${corrected ? 'changed to skipped' : 'saved as skipped'}`
  const dueDate = istanbulDate(new Date(record.dueAt))
  const takenDate = istanbulDate(new Date(record.takenAt))
  const day = takenDate === dueDate ? '' : ` on ${dateLabel(takenDate, dueDate)}`
  const action =
    previous === 'Taken' ? 'updated to taken at' : corrected ? 'changed to taken at' : 'taken at'
  return `${head} ${action} ${doseClock(record.takenAt)}${day}, ${quantityLabel(record.quantity, unit)}`
}

/**
 * A later check found the record of an unconfirmed save (FE-648 F5), for example
 * 'Omega-3 14:00 · already saved as taken at 14:00, 2 capsules'.
 */
export function reconciledConfirmation({
  label,
  unit,
  record,
}: {
  label: string
  unit: DoseUnit
  record: DoseOutcomeRecord
}) {
  const head = `${label} ${doseClock(record.dueAt)} · already saved as`
  if (record.outcome === 'Skipped') return `${head} skipped`
  const dueDate = istanbulDate(new Date(record.dueAt))
  const takenDate = istanbulDate(new Date(record.takenAt))
  const day = takenDate === dueDate ? '' : ` on ${dateLabel(takenDate, dueDate)}`
  return `${head} taken at ${doseClock(record.takenAt)}${day}, ${quantityLabel(record.quantity, unit)}`
}
