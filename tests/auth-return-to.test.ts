import { expect, test } from 'vitest'
import { callbackReturnTo, safeReturnTo } from '../src/features/auth/return-to'

const id = 'c0c22213-a56e-42f5-859b-1d5ba320c036'
test.each([
  '/',
  '/history',
  '/history?date=2026-10-30',
  '/settings',
  '/medications',
  '/medications?add',
  `/medications?medicine=${id}`,
  `/medications?schedule=${id}`,
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
