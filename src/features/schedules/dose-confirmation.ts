import { formatShortDay, formatTime } from '@/lib/calendar-date'
import { quantityLabel, type DoseUnit } from '@/lib/dose-quantity'
import { istanbulDate, type DoseOccurrence, type DoseOutcomeRecord } from './contract'

/** 'Melatonin 22:30 ·', or 'Melatonin 22:30 on Thu 5 Nov ·' for a dose due on another day. */
function doseHead(label: string, dueAt: string, today: string) {
  const dueDate = istanbulDate(new Date(dueAt))
  const day = dueDate === today ? '' : ` on ${formatShortDay(dueDate, today)}`
  return `${label} ${formatTime(dueAt)}${day} ·`
}

/**
 * The confirmation toast after a server-confirmed save, for example
 * 'Melatonin 22:30 · updated to taken at 23:00 on Thu 5 Nov, ½ tablet'. The scheduled time never
 * changes; a dose due on another day than today names its due day in the head, and an intake on
 * another day than scheduled names that day. A change to the amount alone reads
 * 'Melatonin 22:30 · now 1 tablet' (#283).
 */
export function outcomeConfirmation({
  label,
  unit,
  previous,
  previousTakenAt,
  record,
  today,
}: {
  label: string
  unit: DoseUnit
  /** The dose's status before this save. */
  previous: DoseOccurrence['status']
  /** The taken time before this save, when the dose was already Taken. */
  previousTakenAt?: string
  record: DoseOutcomeRecord
  /** Istanbul today, for the year rule. */
  today: string
}) {
  const head = doseHead(label, record.dueAt, today)
  const corrected = previous === 'Taken' || previous === 'Skipped'
  if (record.outcome === 'Skipped')
    return `${head} ${corrected ? 'changed to skipped' : 'saved as skipped'}`
  if (previous === 'Taken' && previousTakenAt === record.takenAt)
    return `${head} now ${quantityLabel(record.quantity, unit)}`
  const dueDate = istanbulDate(new Date(record.dueAt))
  const takenDate = istanbulDate(new Date(record.takenAt))
  const day = takenDate === dueDate ? '' : ` on ${formatShortDay(takenDate, today)}`
  const action =
    previous === 'Taken' ? 'updated to taken at' : corrected ? 'changed to taken at' : 'taken at'
  return `${head} ${action} ${formatTime(record.takenAt)}${day}, ${quantityLabel(record.quantity, unit)}`
}

/**
 * A later check found the record of an unconfirmed save, for example
 * 'Omega-3 14:00 · already saved as taken at 14:00, 2 capsules'.
 */
export function reconciledConfirmation({
  label,
  unit,
  record,
  today,
}: {
  label: string
  unit: DoseUnit
  record: DoseOutcomeRecord
  /** Istanbul today, for the year rule. */
  today: string
}) {
  const head = `${doseHead(label, record.dueAt, today)} already saved as`
  if (record.outcome === 'Skipped') return `${head} skipped`
  const dueDate = istanbulDate(new Date(record.dueAt))
  const takenDate = istanbulDate(new Date(record.takenAt))
  const day = takenDate === dueDate ? '' : ` on ${formatShortDay(takenDate, today)}`
  return `${head} taken at ${formatTime(record.takenAt)}${day}, ${quantityLabel(record.quantity, unit)}`
}
