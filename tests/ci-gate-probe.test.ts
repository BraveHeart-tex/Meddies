import { expect, test } from 'vitest'

test('deliberate unit failure proves the release gate', () => {
  expect(true).toBe(false)
})
