import { spawn, type ChildProcess } from 'node:child_process'
import { once } from 'node:events'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, test } from 'vitest'
import { devServerError } from '../scripts/dev-server.mjs'

let root: string
let child: ChildProcess | undefined
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'meddies-dev-server-'))
})
afterEach(async () => {
  if (child && child.exitCode === null) {
    child.kill()
    await once(child, 'exit')
  }
  child = undefined
  await rm(root, { recursive: true, force: true })
})

// `next dev` records its pid in .next/dev/lock, and a killed one leaves the file behind.
async function lock(pid: number) {
  await mkdir(join(root, '.next/dev'), { recursive: true })
  await writeFile(join(root, '.next/dev/lock'), JSON.stringify({ pid, port: 3000 }))
}

async function spawnIdle(...argv: string[]) {
  child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)', ...argv], {
    stdio: 'ignore',
  })
  await once(child, 'spawn')
  return child.pid!
}

test('a running next dev in this checkout stops lab:capture', async () => {
  // The locking process retitles itself, as `ps` shows it.
  await lock(await spawnIdle('next-server (v16.4.4)'))
  expect(await devServerError(root)).toBe(
    'Stop the dev server (pnpm dev) before lab:capture. next dev is running in this checkout.',
  )
})

test('no lock, a stale lock or an unrelated process on a reused pid lets lab:capture run', async () => {
  expect(await devServerError(root)).toBeUndefined()
  const exited = spawn(process.execPath, ['-e', ''])
  await once(exited, 'exit')
  await lock(exited.pid!)
  expect(await devServerError(root)).toBeUndefined()
  await lock(await spawnIdle('unrelated'))
  expect(await devServerError(root)).toBeUndefined()
})
