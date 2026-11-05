import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { test } from 'node:test'

const run = (...args) =>
  spawnSync(process.execPath, ['scripts/browser-test.mjs', ...args], { encoding: 'utf8' })

test('unknown journeys fail before launching services with a useful name', () => {
  const result = run('missing-journey', '--viewport', '390x844')
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /Unknown browser journey "missing-journey"/)
})

test('malformed viewports fail before launching services with an example', () => {
  const result = run('today-skipped', '--viewport', 'phone')
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /Invalid or missing viewport.*390x844/s)
})

test('the viewport flag is required and dimensions must be positive', () => {
  const missing = run('today-skipped')
  assert.notEqual(missing.status, 0)
  assert.match(missing.stderr, /Invalid or missing viewport/)
  const zero = run('today-skipped', '--viewport', '0x844')
  assert.notEqual(zero.status, 0)
  assert.match(zero.stderr, /Invalid or missing viewport/)
})
