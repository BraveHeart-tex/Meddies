#!/usr/bin/env node
// Captures design lab frames for review: one normal-text 402x874 PNG plus one JSON summary
// per frame, with the Next dev overlay hidden. Exits non-zero on horizontal overflow or a
// console error. Probes the configured browser before builds or services; setup stays explicit.
// Runs its own next dev, so stop pnpm dev first.
// Usage: pnpm lab:capture <slug-prefix> [--out <dir>]   e.g. pnpm lab:capture 241-
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import * as playwright from '@playwright/test'
import { browserUse } from './browser-config.mjs'
import { devServerError } from './dev-server.mjs'

const [prefix, flag, dir] = process.argv.slice(2)
if (!prefix || prefix.startsWith('-') || (flag && (flag !== '--out' || !dir))) {
  console.error('Usage: pnpm lab:capture <slug-prefix> [--out <dir>]   e.g. pnpm lab:capture 241-')
  process.exit(2)
}
const devServer = await devServerError(process.cwd())
if (devServer) {
  console.error(`[lab:capture] ${devServer}`)
  process.exit(1)
}
const out = dir ? resolve(dir) : join(tmpdir(), 'meddies-lab', prefix)

function run(command, args, env = process.env) {
  const { status } = spawnSync(command, args, { stdio: 'inherit', env })
  return status ?? 1
}

try {
  const browser = await playwright[browserUse.browserName].launch({
    ...browserUse.launchOptions,
    headless: browserUse.headless,
  })
  try {
    await browser.newPage()
  } finally {
    await browser.close()
  }
} catch (error) {
  console.error(
    '[lab:capture] Chromium preflight failed. Set up the browser and system libraries with ' +
      '`pnpm exec playwright install --with-deps chromium`, then retry.\n' +
      String(error),
  )
  process.exit(1)
}

// Global setup expects the Worker bundle even when no frame reads storage.
if (run('pnpm', ['worker:build']) !== 0) process.exit(1)
const status = run(
  'pnpm',
  ['exec', 'playwright', 'test', 'browser/lab-capture', '--project=phone', '--grep=@visual'],
  {
    ...process.env,
    MEDDIES_BROWSER_DEV: '1',
    MEDDIES_VISUAL_OUT: out,
    MEDDIES_LAB_PREFIX: prefix,
  },
)
console.log(`[lab:capture] ${status === 0 ? 'PASS' : 'FAIL'}: captures and JSON in ${out}`)
process.exit(status)
