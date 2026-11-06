#!/usr/bin/env node
// Runs browser journeys against fresh builds: always bundles the Worker (~1s), rebuilds
// Next.js with Webpack only when a build input changed, then runs the iphone-17 project.
// Usage: pnpm test:browser:build [playwright args]
import { spawnSync } from 'node:child_process'
import { staleBuildReason } from '../tests/helpers/journey-build.mjs'

function run(label, command, args) {
  const started = performance.now()
  const { status } = spawnSync(command, args, { stdio: 'inherit' })
  const seconds = ((performance.now() - started) / 1000).toFixed(1)
  console.log(`[test:browser:build] ${label}: ${seconds}s`)
  if (status !== 0) process.exit(status ?? 1)
}

run('worker:build', 'pnpm', ['worker:build'])
const stale = await staleBuildReason(process.cwd())
if (stale) {
  console.log(`[test:browser:build] Next.js build needed: ${stale}`)
  run('next build --webpack', 'pnpm', ['exec', 'next', 'build', '--webpack'])
} else console.log('[test:browser:build] Next.js build fresh, skipped')
run('playwright', 'pnpm', [
  'exec',
  'playwright',
  'test',
  '--project=iphone-17',
  ...process.argv.slice(2),
])
