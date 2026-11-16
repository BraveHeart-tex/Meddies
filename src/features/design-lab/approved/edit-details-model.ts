import type { Medicine } from '@/features/medicines/contract'
import { amoxicillin } from '../lab-fixtures'

/**
 * Amoxicillin with two Strength periods: 125 mg/5 ml from the start, then 250 mg/5 ml from
 * Wed 4 Nov at 09:00 Istanbul.
 */
export const amoxicillinRecord: Medicine = {
  ...amoxicillin,
  currentStrengthRevisionId: '55555555-5555-4555-8555-5555555555c2',
  strengthRevisions: [
    {
      id: '55555555-5555-4555-8555-5555555555c1',
      strength: '125 mg/5 ml',
      effectiveAt: '0001-01-01T00:00:00.000Z',
      label: amoxicillin.label,
      unit: amoxicillin.unit,
      previousValues: [],
    },
    {
      id: '55555555-5555-4555-8555-5555555555c2',
      strength: '250 mg/5 ml',
      effectiveAt: '2026-11-04T06:00:00.000Z',
      label: amoxicillin.label,
      unit: amoxicillin.unit,
      previousValues: [],
    },
  ],
}
