import type { MedicineRecord, StrengthRevision } from '@/features/medicines/contract'
import { formatShortDay, formatTime } from '@/lib/calendar-date'
import { amoxicillin, magnesium, TODAY, vitaminD } from '../lab-fixtures'

/** The year-1 storage boundary of a medication's first Strength period. */
const FIRST = '0001-01-01T00:00:00.000Z'

function period(
  medicine: { id: string; label: string; unit: MedicineRecord['unit'] },
  suffix: string,
  strength: string | null,
  effectiveAt: string,
): StrengthRevision {
  return {
    id: `${medicine.id.slice(0, -2)}${suffix}`,
    strength,
    effectiveAt,
    label: medicine.label,
    unit: medicine.unit,
    previousValues: [],
  }
}

function record(
  medicine: Pick<MedicineRecord, 'id' | 'label' | 'strength' | 'unit'>,
  periods: StrengthRevision[],
  history: boolean,
): MedicineRecord {
  return {
    ...medicine,
    revision: 3,
    lastActionId: null,
    currentStrengthRevisionId: periods.at(-1)!.id,
    strengthRevisions: periods,
    everHadSchedule: history,
    everHadDose: history,
    latestTakenAt: history ? '2026-11-09T05:10:00.000Z' : null,
    archivedAt: null,
  }
}

const vitaminDTablet = { ...vitaminD, strength: '1000 IU' }
/** A tablet added today with no schedule or dose yet: Type can still change. */
export const vitaminDRecord = record(
  vitaminDTablet,
  [period(vitaminDTablet, 'd1', '1000 IU', FIRST)],
  false,
)

/** Magnesium has a schedule and doses, one Strength period: Type is locked. */
export const magnesiumRecord = record(
  magnesium,
  [period(magnesium, 'm1', magnesium.strength, FIRST)],
  true,
)

const ibuprofen = {
  id: '77777777-7777-4777-8777-777777777777',
  label: 'Ibuprofen syrup',
  strength: '100 mg/5 ml',
  unit: 'liquid' as const,
}
/** A Liquid added today with no schedule or dose yet: Type can still change. */
export const ibuprofenRecord = record(
  ibuprofen,
  [period(ibuprofen, 'i1', ibuprofen.strength, FIRST)],
  false,
)

/** Amoxicillin: 125 mg/5 ml first, 250 mg/5 ml from Wed 4 Nov at 09:00. Type is locked. */
export const amoxicillinRecord = record(
  amoxicillin,
  [
    period(amoxicillin, 'c1', '125 mg/5 ml', FIRST),
    period(amoxicillin, 'c2', '250 mg/5 ml', '2026-11-04T06:00:00.000Z'),
  ],
  true,
)

/**
 * The period sentence that follows the consequence note. The first period never shows its
 * storage boundary: it starts when the medication was added.
 */
export function periodSentence(medicine: MedicineRecord, periodId: string, today = TODAY) {
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
