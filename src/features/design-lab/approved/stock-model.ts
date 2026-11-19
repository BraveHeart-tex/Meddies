import type { Medicine } from '@/features/medicines/contract'
import type { DailySchedule } from '@/features/schedules/contract'
import { formatQuantity, unitName, type MedicineType } from '@/lib/quantity-policy'
import type { QueryFixtures } from '../fixture-query'
import { magnesiumSchedule, routine } from '../lab-fixtures'

/** A Capsule: 1000 mg, amounts in capsules, so the turn-on drawer can show 7.5 capsules. */
export const omega3: Medicine = {
  id: '88888888-8888-4888-8888-888888888888',
  label: 'Omega-3',
  strength: '1000 mg',
  unit: 'capsule',
  revision: 1,
  stock: { tracked: false },
}

/** Omega-3 every day at 09:00 (1 capsule) since Mon 2 Nov, with no Last day. */
export const omega3Schedule: DailySchedule = {
  ...magnesiumSchedule,
  id: '88888888-8888-4888-8888-8888888888b1',
  medicineId: omega3.id,
  times: [{ time: '09:00', quantity: 1 }],
  endDate: null,
}

/** Omega-3 once tracking is on with the 28 capsules from the pack. */
export const omega3Tracked: Medicine = { ...omega3, stock: { tracked: true, count: 28 } }

/** The rejected starting count the turn-on drawer shows: half capsules are off the grid. */
export const offGridCount = '7.5'

/** `routine` with Omega-3 added, as the detail frames read it. */
export function stockFixtures(medicine: Medicine): QueryFixtures {
  return {
    ...routine,
    medicines: [...routine.medicines, medicine],
    snapshot: { ...routine.snapshot, schedules: [...routine.snapshot.schedules, omega3Schedule] },
  }
}

/**
 * Count and words apart, so the Stock card can set the number in display type: "28", "capsules".
 * Zero and counts above one take the plural; ml never changes.
 */
export function stockParts(count: number, unit: MedicineType) {
  return {
    number: formatQuantity(count, unit),
    unit: unitName(count > 0 && count <= 1 ? 1 : null, unit),
  }
}

export const stockCopy = {
  heading: 'Stock',
  track: 'Track stock',
  offTitle: 'Not tracking stock',
  offBody: (plural: string) => `Add how many ${plural} you have to see the count here.`,
  stop: 'Stop tracking',
  drawerTitle: (label: string) => `Track ${label} stock`,
  drawerBody: (plural: string) => `How many ${plural} do you have now?`,
  countLabel: 'Starting count',
  countHelp: 'Shows on this page and in Medications.',
  start: 'Start tracking',
  confirmTitle: (label: string) => `Stop tracking ${label} stock?`,
  confirmBody: (label: string) =>
    `Meddies stops counting ${label}. To track again, you’ll enter a fresh count.`,
}
