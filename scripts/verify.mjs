#!/usr/bin/env node
import { spawn } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { productionBuild } from './production-build.mjs'

const results = []
let skippedDevStack = false
async function check(label, action) {
  const started = performance.now()
  const output = []
  const run = (command, args, env = process.env) =>
    new Promise((resolve, reject) => {
      const child = spawn(command, args, { env, stdio: ['ignore', 'pipe', 'pipe'] })
      child.stdout.on('data', (data) => output.push(data.toString()))
      child.stderr.on('data', (data) => output.push(data.toString()))
      child.once('error', reject)
      child.once('close', (code, signal) =>
        code === 0 ? resolve() : reject(new Error(`${command} exited ${code ?? signal}`)),
      )
    })
  let passed = true
  try {
    const message = await action(run)
    if (message) output.push(`${message}\n`)
  } catch (error) {
    passed = false
    output.push(`${error.message}\n`)
  }
  const seconds = ((performance.now() - started) / 1000).toFixed(1)
  const text = output.join('')
  results.push({
    label,
    passed,
    seconds,
  })
  process.stdout.write(`\n[verify] ${label}\n${text}`)
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
if (stage1.every(Boolean)) {
  await Promise.all([
    check('unit and component', async (run) => {
      const directory = await mkdtemp(join(tmpdir(), 'meddies-verify-'))
      const report = join(directory, 'unit.json')
      try {
        await run('pnpm', [
          'test:unit',
          '--reporter=default',
          '--reporter=json',
          '--outputFile.json',
          report,
        ])
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
        } finally {
          await rm(directory, { recursive: true, force: true })
        }
      }
    }),
    (async () => {
      const built = await check('build', (run) =>
        productionBuild({
          run: (command, args) =>
            run(command, args, { ...process.env, CI_SKIP_BUILD_TYPECHECK: '1' }),
        }),
      )
      if (built) await check('integration', (run) => run('pnpm', ['test:integration']))
    })(),
  ])
}
console.log('\n[verify] Summary')
for (const { label, passed, seconds } of results)
  console.log(`${passed ? 'PASS' : 'FAIL'} ${label}: ${seconds}s`)
if (skippedDevStack)
  console.log('WARNING: dev stack tests skipped because fixed local ports were unavailable')
const passed = results.every((result) => result.passed)
console.log(`[verify] ${passed ? 'PASS' : 'FAIL'}`)
process.exitCode = passed ? 0 : 1
