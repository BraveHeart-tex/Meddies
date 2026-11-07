import { expect, test } from 'vitest'
import { summarizeLayoutShifts } from './browser/layout'
import { apiPath } from './browser/requests'

const origin = 'http://localhost:4100'

test('apiPath keys same-origin app API requests by path, without the query', () => {
  expect(apiPath(`${origin}/api/schedules?date=2035-06-15`, origin)).toBe('/api/schedules')
  expect(apiPath(`${origin}/api/medicines`, origin)).toBe('/api/medicines')
})

test('apiPath ignores pages, assets and other origins', () => {
  expect(apiPath(`${origin}/history`, origin)).toBeUndefined()
  expect(apiPath(`${origin}/_next/static/chunks/app.js`, origin)).toBeUndefined()
  expect(apiPath(`${origin}/apiary`, origin)).toBeUndefined()
  expect(apiPath('http://localhost:9999/api/schedules', origin)).toBeUndefined()
})

test('summarizeLayoutShifts sums shifts since the start, keeping input-driven shifts apart', () => {
  const entries = [
    { value: 0.2, startTime: 50, hadRecentInput: false },
    { value: 0.05, startTime: 120, hadRecentInput: false },
    { value: 0.3, startTime: 130, hadRecentInput: true },
    { value: 0.01, startTime: 400, hadRecentInput: false },
  ]
  expect(summarizeLayoutShifts(entries, 100)).toEqual({
    cumulativeLayoutShift: 0.06,
    shifts: 2,
    inputShift: 0.3,
    inputShifts: 1,
  })
})

test('summarizeLayoutShifts reports a stable load as zero', () => {
  expect(summarizeLayoutShifts([], 0)).toEqual({
    cumulativeLayoutShift: 0,
    shifts: 0,
    inputShift: 0,
    inputShifts: 0,
  })
})
