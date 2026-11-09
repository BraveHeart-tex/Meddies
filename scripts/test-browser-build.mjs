#!/usr/bin/env node
// Runs browser journeys against fresh builds: always bundles the Worker (~1s), rebuilds
// Next.js only when a build input changed, then runs the phone project.
// Journeys tagged @visual are skipped unless --visual is the first argument.
// Usage: pnpm test:browser:build [playwright args]
//        pnpm test:browser:visual [playwright args]
import { spawnSync } from 'node:child_process'
import { productionBuild } from './production-build.mjs'

const visual = process.argv[2] === '--visual'
const playwrightArgs = process.argv.slice(visual ? 3 : 2)

function run(label, command, args) {
  const started = performance.now()
  const { status } = spawnSync(command, args, { stdio: 'inherit' })
  const seconds = ((performance.now() - started) / 1000).toFixed(1)
  console.log(`[test:browser:build] ${label}: ${seconds}s`)
  if (status !== 0) process.exit(status ?? 1)
}

run('worker:build', 'pnpm', ['worker:build'])
console.log(await productionBuild({ run: (command, args) => run('Next.js', command, args) }))
run('playwright', 'pnpm', [
  'exec',
  'playwright',
  'test',
  '--project=phone',
  visual ? '--grep=@visual' : '--grep-invert=@visual',
  ...playwrightArgs,
])
