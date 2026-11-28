#!/usr/bin/env node
// Captures design lab frames for review: one normal-text 402x874 PNG plus one JSON summary
// per frame, plus an optional high-DPI PNG. Hides the Next dev overlay and exits non-zero
// on horizontal overflow or a console error. Probes the browser before builds or services.
// Runs its own next dev, so stop pnpm dev first. Holds the generated Next.js files lock
// (scripts/next-output-lock.mjs) from before the preflight; its journeys re-enter it.
// Usage: pnpm lab:capture <slug-prefix> [--out <dir>] [--scale <n>]
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import * as playwright from '@playwright/test'
import { browserUse } from './browser-config.mjs'
import { devServerError } from './dev-server.mjs'
import { acquireNextOutputLock } from './next-output-lock.mjs'

const [prefix, ...args] = process.argv.slice(2)
let dir
let scale
try {
  if (!prefix || prefix.startsWith('-')) throw new Error('Provide a frame slug prefix.')
  const { values } = parseArgs({
    args,
    options: { out: { type: 'string' }, scale: { type: 'string' } },
  })
  dir = values.out
  if (dir === '') throw new Error('--out requires a directory.')
  if (values.scale !== undefined) {
    scale = Number(values.scale)
    if (!/^\d+$/.test(values.scale) || !Number.isSafeInteger(scale) || scale <= 1) {
      throw new Error('--scale requires an integer greater than 1.')
    }
  }
} catch (error) {
  console.error(`[lab:capture] ${error.message}`)
  console.error('Usage: pnpm lab:capture <slug-prefix> [--out <dir>] [--scale <n>]')
  process.exit(2)
}
const devServer = await devServerError(process.cwd())
if (devServer) {
  console.error(`[lab:capture] ${devServer}`)
  process.exit(1)
}
const out = dir ? resolve(dir) : join(tmpdir(), 'meddies-lab', prefix)
let lock
try {
  lock = await acquireNextOutputLock({ root: process.cwd(), owner: 'pnpm lab:capture' })
} catch (error) {
  console.error(`[lab:capture] ${error.message}`)
  process.exit(1)
}

function run(command, args, env = lock.env) {
  const { status } = spawnSync(command, args, { stdio: 'inherit', env })
  return status ?? 1
}
async function exit(status) {
  await lock.release()
  process.exit(status)
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
  await exit(1)
}

// Global setup expects the Worker bundle even when no frame reads storage.
if (run('pnpm', ['worker:build']) !== 0) await exit(1)
const status = run(
  'pnpm',
  ['exec', 'playwright', 'test', 'browser/lab-capture', '--project=phone', '--grep=@visual'],
  {
    ...lock.env,
    MEDDIES_BROWSER_DEV: '1',
    MEDDIES_VISUAL_OUT: out,
    MEDDIES_LAB_PREFIX: prefix,
    MEDDIES_LAB_SCALE: scale === undefined ? '' : String(scale),
  },
)
console.log(`[lab:capture] ${status === 0 ? 'PASS' : 'FAIL'}: captures and JSON in ${out}`)
await exit(status)
