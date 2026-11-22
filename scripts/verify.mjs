#!/usr/bin/env node
import { spawn } from 'node:child_process'
import { closeSync, openSync, writeSync } from 'node:fs'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { productionBuild } from './production-build.mjs'

console.log('[verify] Tooling policy: all suites are required locally; no CI-only tooling checks.')

const diagnostics = await mkdtemp(join(tmpdir(), 'meddies-verify-logs-'))
console.log(`[verify] Diagnostic logs: ${diagnostics}`)
const results = []
let skippedDevStack = false
let interrupted
const active = new Map()
// Detached process groups let handled runner signals reach pnpm's descendants too.
// Windows has no POSIX groups; there we forward to the direct child.
function terminate(child, signal) {
  try {
    if (process.platform === 'win32') child.kill(signal)
    else process.kill(-child.pid, signal)
  } catch (error) {
    if (error.code !== 'ESRCH')
      console.error(`[verify] Could not forward ${signal}: ${error.message}`)
  }
}
const signalHandlers = new Map(
  ['SIGINT', 'SIGTERM'].map((signal) => [
    signal,
    () => {
      interrupted ??= signal
      console.log(`[verify] runner received ${signal}`)
      for (const [label, stage] of active) {
        const message = `[verify] interrupted ${label} by ${signal} (log: ${stage.log})`
        console.log(message)
        stage.output(`${message}\n`)
        for (const child of stage.children) terminate(child, signal)
      }
    },
  ]),
)
for (const [signal, handler] of signalHandlers) process.on(signal, handler)
async function check(label, action) {
  if (interrupted) return false
  const started = performance.now()
  const log = join(diagnostics, `${label.replaceAll(/[^a-z0-9]+/g, '-')}.log`)
  const fd = openSync(log, 'w')
  const output = (data) => writeSync(fd, data)
  const children = new Set()
  active.set(label, { log, output, children })
  console.log(`[verify] START ${label} (log: ${log})`)
  const run = (command, args, env = process.env) =>
    new Promise((resolve, reject) => {
      if (interrupted) {
        reject(new Error(`interrupted by ${interrupted}`))
        return
      }
      const child = spawn(command, args, {
        env,
        detached: process.platform !== 'win32',
        stdio: ['ignore', 'pipe', 'pipe'],
      })
      children.add(child)
      child.stdout.on('data', (data) => output(data))
      child.stderr.on('data', (data) => output(data))
      child.once('error', reject)
      child.once('close', (code, signal) => {
        children.delete(child)
        if (signal) {
          const message = `${label}: ${command} terminated by ${signal}`
          output(`${message}\n`)
          console.log(`[verify] ${message}`)
        }
        if (code === 0) resolve()
        else reject(new Error(`${command} exited ${code ?? signal}`))
      })
    })
  let passed = true
  try {
    const message = await action(run)
    if (message) output(`${message}\n`)
  } catch (error) {
    passed = false
    output(`${error.message}\n`)
  }
  if (interrupted) passed = false
  active.delete(label)
  const seconds = ((performance.now() - started) / 1000).toFixed(1)
  closeSync(fd)
  results.push({
    label,
    passed,
    seconds,
  })
  console.log(`[verify] ${passed ? 'PASS' : 'FAIL'} ${label}: ${seconds}s (log: ${log})`)
  return passed
}

const cached = !process.env.CI
const stage1 = await Promise.all([
  check('lint', (run) =>
    run('pnpm', ['lint', ...(cached ? ['--cache', '--cache-location', '.cache/eslint'] : [])]),
  ),
  check('format', (run) =>
    run('pnpm', [
      'format:check',
      ...(cached ? ['--cache', '--cache-location', '.cache/prettier'] : []),
    ]),
  ),
  check('typecheck', (run) => run('pnpm', ['typecheck'])),
])
// Stage 2 runs in order: unit and component tests time out when the build and integration
// share the CPU. A unit failure still runs the rest; integration needs the build.
if (!interrupted && stage1.every(Boolean)) {
  await check('unit, component and tooling', async (run) => {
    const directory = await mkdtemp(join(tmpdir(), 'meddies-verify-'))
    const report = join(directory, 'unit.json')
    let failure
    try {
      await run('pnpm', [
        'test:unit',
        '--project',
        'tooling',
        '--reporter=default',
        '--reporter=json',
        '--outputFile.json',
        report,
      ])
    } catch (error) {
      failure = error
      throw error
    } finally {
      try {
        const data = JSON.parse(await readFile(report, 'utf8'))
        skippedDevStack = data.testResults.some(
          (result) =>
            result.name.endsWith('/tests/dev-stack.test.ts') &&
            result.assertionResults.some((assertion) =>
              ['pending', 'skipped'].includes(assertion.status),
            ),
        )
      } catch (error) {
        if (!failure) throw error
      } finally {
        await rm(directory, { recursive: true, force: true })
      }
    }
  })
  const built = await check('build', (run) =>
    productionBuild({
      run: (command, args) => run(command, args, { ...process.env, CI_SKIP_BUILD_TYPECHECK: '1' }),
    }),
  )
  if (built) await check('integration', (run) => run('pnpm', ['test:integration']))
}
console.log('\n[verify] Summary')
for (const { label, passed, seconds } of results)
  console.log(`${passed ? 'PASS' : 'FAIL'} ${label}: ${seconds}s`)
if (!results.some(({ label }) => label === 'unit, component and tooling'))
  console.log('SKIP unit, component and tooling: static checks failed or runner interrupted')
if (skippedDevStack)
  console.log('WARNING: dev stack tests skipped because fixed local ports were unavailable')
for (const [signal, handler] of signalHandlers) process.off(signal, handler)
const passed = !interrupted && results.every((result) => result.passed)
console.log(`[verify] ${passed ? 'PASS' : 'FAIL'}`)
process.exitCode = interrupted ? (interrupted === 'SIGTERM' ? 143 : 130) : passed ? 0 : 1
