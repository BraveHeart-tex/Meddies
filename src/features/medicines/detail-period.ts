import type { MedicineRecord } from './contract'
import { formatShortDay, formatTime } from '@/lib/calendar-date'

const FIRST = '0001-01-01T00:00:00.000Z'

/**
 * The period sentence that follows the consequence note. The first period never shows its
 * storage boundary: it starts when the medication was added.
 */
export function detailPeriodSentence(
  medicine: Pick<MedicineRecord, 'label' | 'strengthRevisions'>,
  periodId: string,
  today: string,
) {
  const periods = medicine.strengthRevisions
  const index = periods.findIndex((row) => row.id === periodId)
  const current = periods[index]
  const next = periods[index + 1]
  const at = (instant: string) => `${formatShortDay(instant, today)} at ${formatTime(instant)}`
  const start = current.effectiveAt === FIRST ? `when you added ${medicine.label}` : null
  if (next)
    return `This period ran from ${start ?? at(current.effectiveAt)} until ${at(next.effectiveAt)}.`
  return start ? `This period started ${start}.` : `This period started ${at(current.effectiveAt)}.`
}
