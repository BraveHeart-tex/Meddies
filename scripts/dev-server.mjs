import { execFile } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { promisify } from 'node:util'

/**
 * `next dev` holds .next/dev/lock in this checkout, so a second dev server (dev-mode journeys,
 * lab:capture) fails with "fetch failed / other side closed".
 * Returns why to stop, or undefined when no live dev server owns the lock. A killed server
 * leaves its lock behind, so the recorded pid must still be a Next.js process.
 */
export async function devServerError(root) {
  let pid
  try {
    pid = JSON.parse(await readFile(join(root, '.next/dev/lock'), 'utf8')).pid
  } catch {
    return undefined
  }
  if (!Number.isInteger(pid)) return undefined
  let command
  try {
    ;({ stdout: command } = await promisify(execFile)('ps', ['-p', String(pid), '-o', 'command=']))
  } catch {
    return undefined
  }
  if (!/next/.test(command)) return undefined
  return 'Stop the dev server (pnpm dev) before lab:capture. next dev is running in this checkout.'
}
