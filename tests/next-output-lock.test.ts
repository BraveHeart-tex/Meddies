import { spawn, type ChildProcess } from 'node:child_process'
import { once } from 'node:events'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, beforeEach, expect, test } from 'vitest'
import { acquireNextOutputLock, lockEnv, withNextOutputLock } from '../scripts/next-output-lock.mjs'

const lockModule = resolve('scripts/next-output-lock.mjs')
let root: string
const children: ChildProcess[] = []
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'meddies-next-output-lock-'))
})
afterEach(async () => {
  for (const child of children.splice(0))
    if (child.exitCode === null && child.signalCode === null) {
      child.kill('SIGKILL')
      await once(child, 'exit')
    }
  await rm(root, { recursive: true, force: true })
})

/** A separate process that takes the lock as `owner`, prints `held`, then runs `then`. */
async function holder(owner: string, then: string, env: NodeJS.ProcessEnv = process.env) {
  const child = spawn(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `import { acquireNextOutputLock } from ${JSON.stringify(lockModule)}
       const lock = await acquireNextOutputLock({ root: ${JSON.stringify(root)}, owner: '${owner}' })
       console.log('held')
       ${then}`,
    ],
    { env, stdio: ['ignore', 'pipe', 'inherit'] },
  )
  children.push(child)
  const [data] = (await once(child.stdout!, 'data')) as [Buffer]
  expect(data.toString()).toBe('held\n')
  return child
}

const conflict = (owner: string) =>
  new RegExp(`^${owner} \\(pid \\d+\\) is creating or deleting generated Next.js files`)

test('a failed or interrupted holder leaves the lock usable for the next run', async () => {
  // Failure: the wrapper releases before rethrowing (typecheck, builds, lab:capture).
  await expect(
    withNextOutputLock({ root, owner: 'pnpm typecheck' }, () => {
      throw new Error('tsc failed')
    }),
  ).rejects.toThrow('tsc failed')
  await (await acquireNextOutputLock({ root, owner: 'pnpm lab:capture' })).release()

  // Interruption: a killed holder never releases, so its dead pid marks the lock stale.
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGKILL'] as const) {
    const child = await holder('pnpm lab:capture', 'setInterval(() => {}, 1000)')
    await expect(acquireNextOutputLock({ root, owner: 'pnpm typecheck' })).rejects.toThrow(
      conflict('pnpm lab:capture'),
    )
    child.kill(signal)
    await once(child, 'exit')
    await (await acquireNextOutputLock({ root, owner: 'pnpm typecheck' })).release()
  }
})

test('nested wrappers re-enter, competitors conflict and ordinary next dev holds nothing', async () => {
  // A running `pnpm dev` owns .next/dev/lock, not this lock: verification still starts.
  const dev = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)', 'next-server'])
  children.push(dev)
  await once(dev, 'spawn')
  await mkdir(join(root, '.next/dev'), { recursive: true })
  await writeFile(join(root, '.next/dev/lock'), JSON.stringify({ pid: dev.pid, port: 3000 }))
  const parent = await acquireNextOutputLock({ root, owner: 'pnpm lab:capture' })
  expect(parent.env[lockEnv]).toEqual(expect.any(String))

  // lab:capture -> playwright global setup: the child inherits the token and re-enters.
  const nested = await holder(
    'dev-mode journeys',
    'await lock.release(); process.exit(0)',
    parent.env as NodeJS.ProcessEnv,
  )
  const [code] = await once(nested, 'exit')
  expect(code).toBe(0)

  // The nested release left the parent's lock in place for competitors without the token.
  await expect(acquireNextOutputLock({ root, owner: 'pnpm typecheck' })).rejects.toThrow(
    conflict('pnpm lab:capture'),
  )
  await expect(
    acquireNextOutputLock({ root, owner: 'pnpm typecheck', env: { [lockEnv]: 'stale' } }),
  ).rejects.toThrow(/Rerun pnpm typecheck after it finishes/)
  await parent.release()
  await (await acquireNextOutputLock({ root, owner: 'pnpm typecheck' })).release()
})
