import type { Medicine } from '@/features/medicines/contract'
import type { DailySchedule } from '@/features/schedules/contract'

/** Saved at 10:00 Istanbul on Monday 9 November. */
export const NOW = '2026-11-09T07:00:00.000Z'
export const TODAY = '2026-11-09'

export const magnesium: Medicine = {
  id: '11111111-1111-4111-8111-111111111111',
  label: 'Magnesium',
  strength: '400 mg',
  unit: 'tablet',
}

/** Ibuprofen has no schedule: every dose of it is an Unscheduled dose. */
export const ibuprofen: Medicine = {
  id: '66666666-6666-4666-8666-666666666666',
  label: 'Ibuprofen',
  strength: '200 mg',
  unit: 'tablet',
}

/** Magnesium every day at 08:00 and 20:00 since Mon 2 Nov, Last day Tue 10 Nov. */
export const magnesiumSchedule: DailySchedule = {
  id: '11111111-1111-4111-8111-1111111111b1',
  medicineId: magnesium.id,
  startDate: '2026-11-02',
  weekdays: [0, 1, 2, 3, 4, 5, 6],
  times: [
    { time: '08:00', quantity: 1 },
    { time: '20:00', quantity: 1 },
  ],
  intervalHours: null,
  endDate: '2026-11-10',
  confirmedAt: '2026-11-01T18:00:00.000Z',
  stoppedAt: null,
}
