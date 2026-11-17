import { expect, test } from 'vitest'
import { callbackReturnTo, safeReturnTo } from '../src/features/auth/return-to'

const id = 'c0c22213-a56e-42f5-859b-1d5ba320c036'
const occurrence = encodeURIComponent(`${id}:2026-11-17T06:00:00.000Z`)
test.each([
  '/',
  '/history',
  '/history?date=2026-10-30',
  '/settings',
  '/medications',
  '/medications?add',
  `/medications?medicine=${id}`,
  `/medications?schedule=${id}`,
  // A signed-out Reminder link returns to itself, so its drawer opens after sign-in (#367).
  `/?occurrence=${occurrence}`,
  // A signed-out grouped Reminder link returns to itself, so its screen opens after sign-in (#374).
  `/?due=${encodeURIComponent('2026-11-17T06:00:00.000Z')}`,
])('allows supported destination %s', (path) => {
  expect(safeReturnTo(path)).toBe(path)
  expect(callbackReturnTo(`https://meddies.test${path}`, 'https://meddies.test')).toBe(path)
})
test.each([
  undefined,
  ['/', '/settings'],
  '//evil.test',
  'https://evil.test',
  '/other',
  '/settings?x',
  '/history?date=2026-02-30',
  '/history?date=2026-10-30&extra=1',
  '/history#date',
  '/medications?medicine=bad',
  '/medications?add&x=1',
  '/\\evil.test',
  '/\nsettings',
  `/?occurrence=${id}`,
  `/?occurrence=${occurrence}&extra=1`,
  `/?occurrence=${id}:2026-11-17T06:00:00.000Z`,
  `/?occurrence=${encodeURIComponent(`${id}:2026-02-30T06:00:00.000Z`)}`,
  '/?due=2026-11-17T06:00:00.000Z',
  `/?due=${encodeURIComponent('2026-11-17T06:00:00Z')}`,
  `/?due=${encodeURIComponent('2026-11-17T06:00:00.000Z')}&extra=1`,
])('unsupported destination falls back to Today: %s', (path) => {
  expect(safeReturnTo(path)).toBe('/')
})
test.each([
  'https://evil.test/history',
  '//evil.test/settings',
  'https://meddies.test/settings#x',
  'https://name@meddies.test/settings',
  '/history?extra=1',
])('callback URLs cannot escape the allowlist: %s', (path) => {
  expect(callbackReturnTo(path, 'https://meddies.test')).toBe('/')
})
