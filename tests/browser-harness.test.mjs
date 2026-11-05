import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, delimiter, dirname, join } from 'node:path'
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

test('selected weekdays stops immediately and reports an empty time readback', async (t) => {
  const bin = await mkdtemp(join(tmpdir(), 'meddies-browser-test-'))
  t.after(() => rm(bin, { recursive: true, force: true }))
  const log = join(bin, 'commands.log')
  await writeFile(
    join(bin, 'agent-browser'),
    `#!/usr/bin/env node
const args = process.argv.slice(4)
require('node:fs').appendFileSync(process.env.BROWSER_TEST_LOG, JSON.stringify(args) + '\\n')
if (args[0] === 'get') console.log('')
`,
    { mode: 0o700 },
  )

  const result = spawnSync(
    process.execPath,
    ['scripts/browser-test.mjs', 'selected-weekdays', '--viewport', '390x844'],
    {
      encoding: 'utf8',
      env: { ...process.env, PATH: bin + delimiter + process.env.PATH, BROWSER_TEST_LOG: log },
      timeout: 30_000,
    },
  )
  assert.ifError(result.error)
  const commands = (await readFile(log, 'utf8'))
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line))
  const screenshot = commands.find(([command]) => command === 'screenshot')
  if (screenshot) {
    const artifact = basename(dirname(screenshot[1]))
    assert.match(artifact, /^\d+-selected-weekdays$/)
    t.after(() => rm(join('.browser-artifacts', artifact), { recursive: true, force: true }))
  }

  assert.equal(result.status, 1, result.stderr)
  assert.match(
    result.stderr,
    /FAIL step "journey setup: Time input #dose-time-0: expected "23:59", actual ""/,
  )
  const readback = commands.findIndex(([command]) => command === 'get')
  assert.ok(readback > 0)
  assert.equal(commands[readback - 1][0], 'eval')
  assert.deepEqual(commands[readback], ['get', 'value', '#dose-time-0'])
  assert.deepEqual(
    commands.slice(readback + 1).map(([command]) => command),
    ['screenshot', 'close'],
  )
})
