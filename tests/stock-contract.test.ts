import { expect, test } from 'vitest'
import { parseMedicine, parseStockOn } from '../src/features/medicines/contract'

const key = {
  actionId: '10000000-0000-4000-8000-000000000001',
  medicineId: '10000000-0000-4000-8000-000000000002',
  expectedRevision: 0,
}
test('starting counts follow the Quantity unit grid and safe bound, allowing zero', () => {
  for (const [unit, startingCount] of [
    ['tablet', 12.5],
    ['liquid', 150],
    ['tablet', 0],
  ] as const) {
    expect(parseStockOn({ ...key, unit, startingCount }).startingCount).toBe(startingCount)
    expect(
      parseMedicine({ id: key.medicineId, label: 'Example', unit, startingCount }).startingCount,
    ).toBe(startingCount)
  }
  for (const [unit, startingCount] of [
    ['capsule', 7.5],
    ['tablet', -1],
    ['tablet', Number.MAX_SAFE_INTEGER],
    ['liquid', 0.15],
    ['tablet', null],
  ] as const) {
    expect(() => parseStockOn({ ...key, unit, startingCount })).toThrow('validation')
    expect(() =>
      parseMedicine({ id: key.medicineId, label: 'Example', unit, startingCount }),
    ).toThrow('validation')
  }
  expect(() => parseStockOn({ ...key, unit: 'tablet' })).toThrow('validation')
})
