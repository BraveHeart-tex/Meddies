import type { TypeCorrectionReview } from '@/features/medicines/type-correction-contract'
import { magnesium } from '../lab-fixtures'

export const repairMedicine = { ...magnesium, strength: '400 mg' }
export const repairReview: TypeCorrectionReview = {
  medicineId: magnesium.id,
  fromUnit: 'tablet',
  unit: 'capsule',
  revision: 4,
  reviewVersion: 1,
  stockTracked: true,
  compatibleAmounts: 7,
  conflicts: Array.from({ length: 26 }, (_, index) =>
    index < 24
      ? {
          key: `dose:${index}`,
          kind: 'scheduled',
          quantity: 0.5,
          time: new Date(Date.UTC(2026, 10, 8 - index, 5, 10)).toISOString(),
        }
      : {
          key: `schedule:${index}`,
          kind: 'schedule',
          quantity: index === 24 ? 0.5 : 1.5,
          time: '08:00',
          version: {
            id: '00000000-0000-4000-8000-000000450001',
            startDate: index === 24 ? '2026-11-01' : '2026-10-01',
            confirmedAt: '2026-10-01T05:00:00.000Z',
            replacedAt: index === 24 ? null : '2026-10-31T05:00:00.000Z',
          },
        },
  ),
}
