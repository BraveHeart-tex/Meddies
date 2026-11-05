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

test('a missing selector reports the step, URL, expectation and browser error within five seconds', async (t) => {
  const bin = await mkdtemp(join(tmpdir(), 'meddies-browser-test-'))
  t.after(() => rm(bin, { recursive: true, force: true }))
  const state = join(bin, 'state.json')
  await writeFile(
    join(bin, 'agent-browser'),
    `#!/usr/bin/env node
const assert = require('node:assert/strict')
const fs = require('node:fs')
const state = process.env.BROWSER_TEST_STATE
const [command, value] = process.argv.slice(4)
if (command === 'open') fs.writeFileSync(state, JSON.stringify({ url: value }))
if (command === 'wait') {
  assert.equal(value, '#deliberately-missing')
  assert.equal(process.env.AGENT_BROWSER_DEFAULT_TIMEOUT, '3000')
  const page = JSON.parse(fs.readFileSync(state, 'utf8'))
  fs.writeFileSync(state, JSON.stringify({ ...page, started: Date.now() }))
  setTimeout(() => {
    console.error('Wait timed out after 3000ms')
    process.exitCode = 1
  }, Number(process.env.AGENT_BROWSER_DEFAULT_TIMEOUT))
}
if (command === 'get' && value === 'url') {
  const page = JSON.parse(fs.readFileSync(state, 'utf8'))
  fs.writeFileSync(state, JSON.stringify({ ...page, elapsed: Date.now() - page.started }))
  console.log(page.url)
}
if (command === 'screenshot') fs.writeFileSync(value, '')
`,
    { mode: 0o700 },
  )

  const result = spawnSync(
    process.execPath,
    ['scripts/browser-test.mjs', 'wait-diagnostics', '--viewport', '390x844'],
    {
      encoding: 'utf8',
      env: { ...process.env, PATH: bin + delimiter + process.env.PATH, BROWSER_TEST_STATE: state },
      timeout: 15_000,
    },
  )
  assert.ifError(result.error)
  const artifact = result.stderr.match(/^Artifacts: (.+)$/m)?.[1]
  assert.match(artifact ?? '', /[\\/]\.browser-artifacts[\\/]\d+-wait-diagnostics$/)
  t.after(() => rm(artifact, { recursive: true, force: true }))
  assert.equal(result.status, 1, result.stderr)
  const { url, elapsed } = JSON.parse(await readFile(state, 'utf8'))
  assert.ok(elapsed >= 3000 && elapsed < 5000, `Wait and URL lookup took ${elapsed}ms`)
  assert.match(
    result.stderr,
    /FAIL step "wait for a deliberately missing element: URL http:\/\/localhost:\d+; expected selector "#deliberately-missing"; browser error: Wait timed out after 3000ms"/,
  )
  assert.ok(result.stderr.includes(url))
  await readFile(join(artifact, 'failure.png'))
  assert.match(await readFile(join(artifact, 'service.log'), 'utf8'), /Next\.js/)
})

test('selected weekdays stops immediately and reports an empty time readback', async (t) => {
  const bin = await mkdtemp(join(tmpdir(), 'meddies-browser-test-'))
  t.after(() => rm(bin, { recursive: true, force: true }))
  const log = join(bin, 'commands.log')
  await writeFile(
    join(bin, 'agent-browser'),
    `#!/usr/bin/env node
const args = process.argv.slice(4)
const fs = require('node:fs')
const log = process.env.BROWSER_TEST_LOG
fs.appendFileSync(log, JSON.stringify(args) + '\\n')
if (args[0] === 'get') {
  const preceding = fs.readFileSync(log, 'utf8').trim().split('\\n').at(-2)
  const [, script] = JSON.parse(preceding)
  console.log(args[2] === '#schedule-start' ? script.match(/"([0-9]{4}-[0-9]{2}-[0-9]{2})"/)[1] : '')
}
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
  const readback = commands.findIndex(
    ([command, , selector]) => command === 'get' && selector === '#dose-time-0',
  )
  assert.ok(readback > 0)
  assert.equal(commands[readback - 1][0], 'eval')
  assert.deepEqual(commands[readback], ['get', 'value', '#dose-time-0'])
  assert.deepEqual(
    commands.slice(readback + 1).map(([command]) => command),
    ['screenshot', 'close'],
  )
})
