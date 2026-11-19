import type { Medicine } from '@/features/medicines/contract'
import type { DailySchedule } from '@/features/schedules/contract'
import type { QueryFixtures } from '../fixture-query'
import { amoxicillin, amoxicillinSchedule, routine } from '../lab-fixtures'

/**
 * #403 Medication detail hierarchy, approved Direction B: the states it draws, as Amoxicillin on Mon 9
 * Nov at 10:00, with Ibuprofen for the never-scheduled, never-dosed record that can be deleted.
 */
export type DetailState =
  'clock' | 'interval' | 'paused' | 'ended' | 'none' | 'saved' | 'archived' | 'slots'

const amox: Medicine = {
  ...amoxicillin,
  currentStrengthRevisionId: 'lab',
  everHadSchedule: true,
  everHadDose: true,
  archivedAt: null,
  stock: { tracked: false },
}

const amoxTracked: Medicine = { ...amox, stock: { tracked: true, count: 120 } }

/** Never scheduled, never dosed: Delete medication shows. */
const ibuprofen: Medicine = {
  id: '99999999-9999-4999-8999-999999999999',
  label: 'Ibuprofen',
  strength: '200 mg',
  unit: 'tablet',
  revision: 1,
  currentStrengthRevisionId: 'lab',
  everHadSchedule: false,
  everHadDose: false,
  archivedAt: null,
  stock: { tracked: false },
}

const archived: Medicine = { ...amoxTracked, archivedAt: '2026-11-08T09:00:00.000Z' }

/** Every day at 08:00 (5 ml) and 20:00 (2.5 ml) since Mon 2 Nov, Last day Sat 14 Nov. */
const clock: DailySchedule = { ...amoxicillinSchedule, endDate: '2026-11-14' }

/** Every 8 hours from Mon 2 Nov at 08:00, 5 ml each time. */
const interval: DailySchedule = {
  ...amoxicillinSchedule,
  intervalHours: 8,
  times: [{ time: '08:00', quantity: 5 }],
}

const paused: DailySchedule = { ...amoxicillinSchedule, pausedAt: '2026-11-07T09:00:00.000Z' }
const ended: DailySchedule = { ...amoxicillinSchedule, endDate: '2026-11-06' }

export type StateData = {
  medicine: Medicine
  schedule: DailySchedule | null
  saved?: boolean
}

export function stateData(state: DetailState): StateData {
  switch (state) {
    case 'clock':
      return { medicine: amox, schedule: clock }
    case 'interval':
      return { medicine: amoxTracked, schedule: interval }
    case 'paused':
      return { medicine: amoxTracked, schedule: paused }
    case 'ended':
      return { medicine: amoxTracked, schedule: ended }
    case 'none':
      return { medicine: ibuprofen, schedule: null }
    case 'saved':
      return { medicine: { ...ibuprofen, label: 'Ibuprofen' }, schedule: null, saved: true }
    case 'archived':
      return { medicine: archived, schedule: null }
    case 'slots':
      return { medicine: amoxTracked, schedule: clock }
  }
}

/** `routine` with this state's medication and schedule in place of Amoxicillin's. */
export function detailFixtures({ medicine, schedule }: StateData): QueryFixtures {
  return {
    ...routine,
    medicines: [...routine.medicines.filter((item) => item.id !== medicine.id), medicine],
    snapshot: {
      ...routine.snapshot,
      schedules: [
        ...routine.snapshot.schedules.filter((item) => item.medicineId !== medicine.id),
        ...(schedule ? [schedule] : []),
      ],
    },
  }
}

/** New labels approved with Direction B (#403 approval comment). */
export const detailCopy = {
  archivedTitle: 'Archived',
  archivedBody:
    'Kept in History. The schedule has stopped, reminders are cancelled and stock is unchanged.',
  manage: 'Manage medication',
  manageHint: 'Schedule and details',
}
