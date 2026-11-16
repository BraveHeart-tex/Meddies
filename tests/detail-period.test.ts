import { expect, test } from 'vitest'
import type { MedicineRecord } from '../src/features/medicines/contract'
import { detailPeriodSentence } from '../src/features/medicines/detail-period'

const periods = [
  '0001-01-01T00:00:00.000Z',
  '2026-11-04T06:00:00.000Z',
  '2026-11-12T05:00:00.000Z',
].map((effectiveAt, index) => ({
  id: String(index),
  effectiveAt,
  label: 'Amoxicillin',
  unit: 'liquid' as const,
  strength: '250 mg/5 ml',
  previousValues: [],
}))

test.each([
  [1, '0', 'This period started when you added Amoxicillin.'],
  [2, '1', 'This period started Wed 4 Nov at 09:00.'],
  [2, '0', 'This period ran from when you added Amoxicillin until Wed 4 Nov at 09:00.'],
  [3, '1', 'This period ran from Wed 4 Nov at 09:00 until Thu 12 Nov at 08:00.'],
])('describes %i periods at %s without exposing the storage boundary', (count, id, expected) => {
  const medicine = {
    label: 'Amoxicillin',
    strengthRevisions: periods.slice(0, count),
  } satisfies Pick<MedicineRecord, 'label' | 'strengthRevisions'>
  expect(detailPeriodSentence(medicine, id, '2026-11-16')).toBe(expected)
})
