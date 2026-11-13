import type { Medicine } from '@/features/medicines/contract'

/** Saved at 10:00 Istanbul on Monday 9 November, the worked example in #212. */
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
