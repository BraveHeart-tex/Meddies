#!/usr/bin/env node
// Generates Next.js route types and checks the app holding the generated Next.js files lock
// (scripts/next-output-lock.mjs): a dev-mode capture or build deleting `.next` types mid-run
// otherwise fails tsc with TS6053. The Worker typecheck reads no Next.js output and runs after.
import { spawnSync } from 'node:child_process'
import { withNextOutputLock } from './next-output-lock.mjs'

const run = (args, env) =>
  spawnSync('pnpm', ['exec', ...args], { stdio: 'inherit', env }).status ?? 1

let status
try {
  status = await withNextOutputLock({ root: process.cwd(), owner: 'pnpm typecheck' }, (env) => {
    const typegen = run(['next', 'typegen'], env)
    return typegen === 0 ? run(['tsc', '--noEmit'], env) : typegen
  })
} catch (error) {
  console.error(`[typecheck] ${error.message}`)
  process.exit(1)
}
if (status === 0) status = spawnSync('pnpm', ['worker:typecheck'], { stdio: 'inherit' }).status ?? 1
process.exit(status)
