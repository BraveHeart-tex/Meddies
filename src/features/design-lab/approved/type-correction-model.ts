import type { MedicineRecord } from '@/features/medicines/contract'
import { magnesium, NOW } from '../lab-fixtures'

/** #440's synthetic large-history example. No backend preflight shape is implied here. */
export const correctionMedicine: MedicineRecord = {
  ...magnesium,
  revision: 4,
  lastActionId: null,
  currentStrengthRevisionId: '440-current',
  strengthRevisions: [
    {
      id: '440-earlier',
      label: 'Magnesium',
      strength: '200 mg',
      unit: 'tablet',
      effectiveAt: '2026-10-01T05:00:00Z',
      previousValues: [],
    },
    {
      id: '440-current',
      label: 'Magnesium',
      strength: '400 mg',
      unit: 'tablet',
      effectiveAt: '2026-11-01T05:00:00Z',
      previousValues: [],
    },
  ],
  everHadSchedule: true,
  everHadDose: true,
  latestTakenAt: NOW,
  archivedAt: null,
  stock: { tracked: true, count: 18, threshold: 5 },
}

export type SharedState =
  'cancel' | 'pending' | 'unconfirmed' | 'rejected' | 'stale' | 'offline' | 'saved' | 'session'

/** Explicit synthetic user entries for the revised final-review frame, not suggested amounts. */
export const reviewedCorrectionAmounts: Record<number, string> = {
  0: '1',
  1: '1',
  2: '1',
  3: '1',
  4: '1',
  5: '1',
  6: '1',
  7: '1',
  8: '1',
  9: '1',
  10: '1',
  11: '1',
  12: '1',
  13: '1',
  14: '1',
  15: '1',
  16: '1',
  17: '1',
  18: '1',
  19: '1',
  20: '1',
  21: '1',
  22: '1',
  23: '1',
  24: '1',
  25: '2',
}

/** Distinct synthetic intake dates, newest first. */
export const correctionDoseDays = Array.from({ length: 24 }, (_, offset) =>
  new Date(Date.UTC(2026, 10, 8 - offset)).toISOString().slice(0, 10),
)
