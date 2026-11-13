import type { Medicine } from '@/features/medicines/contract'
import { istanbulDate, type DoseOccurrence } from '@/features/schedules/contract'
import { scheduledInstant } from '@/features/schedules/occurrences'
import { localMinute, type TakenAtChoice } from '@/features/schedules/taken-form-schema'
import type { UnscheduledDose } from '@/features/unscheduled-doses/contract'
import { formatShortDay, formatTime } from '@/lib/calendar-date'
import { formatQuantity, quantityLabel } from '@/lib/dose-quantity'
import { ibuprofen, magnesium, magnesiumSchedule, TODAY } from '../lab-fixtures'

export const YESTERDAY = '2026-11-08'
/** 00:20 on Mon 9 Nov: a dose taken at 23:30 belongs to Sun 8 Nov (the #28 Cross-midnight example). */
export const AFTER_MIDNIGHT = '2026-11-08T21:20:00.000Z'

export const at = (date: string, time: string) => scheduledInstant(date, time)

export const unscheduled = (
  id: number,
  medicine: Medicine,
  takenAt: string,
  quantity = 1,
): UnscheduledDose => ({
  id: `77777777-7777-4777-8777-${String(id).padStart(12, '0')}`,
  actionId: `88888888-8888-4888-8888-${String(id).padStart(12, '0')}`,
  medicineId: medicine.id,
  takenAt,
  quantity,
  outcome: 'Taken',
  revision: 0,
  removed: false,
})

const scheduled = (date: string, time: string, taken?: string): DoseOccurrence => {
  const dueAt = at(date, time)
  const base = {
    id: `${magnesiumSchedule.id}:${dueAt}`,
    scheduleId: magnesiumSchedule.id,
    medicineId: magnesium.id,
    dueAt,
    quantity: 1,
  }
  return taken
    ? {
        ...base,
        status: 'Taken',
        record: {
          scheduleId: magnesiumSchedule.id,
          dueAt,
          takenAt: at(date, taken),
          quantity: 1,
          outcome: 'Taken',
        },
      }
    : { ...base, status: date === TODAY && time > '10:00' ? 'Upcoming' : 'Not logged' }
}

/** The dose the change drawer opens: Ibuprofen, 1 tablet at 09:30 today. */
export const morningIbuprofen = unscheduled(1, ibuprofen, at(TODAY, '09:30'))

/** Today at 10:00 (the #28 Beside a schedule example): 08:00 taken, 20:00 next, 09:30 between. */
export const todayScheduled = [scheduled(TODAY, '08:00', '08:05'), scheduled(TODAY, '20:00')]
export const todayUnscheduled = [morningIbuprofen]

/** A Today with no scheduled doses, where two Ibuprofen doses replace the empty state. */
export const onlyUnscheduled = [
  unscheduled(2, ibuprofen, at(TODAY, '07:15')),
  { ...morningIbuprofen, quantity: 2 },
]

/** Sun 8 Nov in History: 20:00 Not logged, two Unscheduled doses, the later one from 00:20. */
export const yesterdayScheduled = [
  scheduled(YESTERDAY, '08:00', '08:05'),
  scheduled(YESTERDAY, '20:00'),
]
export const yesterdayUnscheduled = [
  unscheduled(3, ibuprofen, at(YESTERDAY, '15:10')),
  unscheduled(4, magnesium, at(YESTERDAY, '23:30'), 0.5),
]

export const medicines = [magnesium, ibuprofen]

export type DoseValues = { when: TakenAtChoice; date: string; time: string; quantity: string }

export const nowValues: DoseValues = { when: 'now', date: '', time: '', quantity: '1' }

/** A saved dose opens on Other at its own minute and quantity, as Edit dose does. */
export const savedValues = (dose: UnscheduledDose): DoseValues => {
  const local = localMinute(dose.takenAt)
  return {
    when: 'other',
    date: local.slice(0, 10),
    time: local.slice(11),
    quantity: formatQuantity(dose.quantity),
  }
}

/**
 * The Unscheduled dose save message: 'Ibuprofen · taken at 10:00, 1 tablet', naming the day
 * when it is not today: 'Magnesium · taken at 23:30 on Sun 8 Nov, ½ tablet'.
 */
export function savedMessage(
  medicine: Medicine,
  dose: UnscheduledDose,
  today: string,
  verb = 'taken at',
) {
  const taken = istanbulDate(new Date(dose.takenAt))
  const day = taken === today ? '' : ` on ${formatShortDay(taken, today)}`
  return `${medicine.label} · ${verb} ${formatTime(dose.takenAt)}${day}, ${quantityLabel(dose.quantity, medicine.unit)}`
}

export const removedMessage = (medicine: Medicine, dose: UnscheduledDose) =>
  `${medicine.label} ${formatTime(dose.takenAt)} · dose removed`
