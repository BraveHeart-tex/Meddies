import { randomUUID } from 'node:crypto'
import { link, mkdir, readFile, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

/**
 * Steps that create or delete generated Next.js files in one checkout hold
 * `.cache/next-output.lock` while they run, so they never consume files a competing step is
 * creating or removing. `next dev --webpack` wipes `.next/dev` (route types included) on every
 * start, `next build` wipes `.next/types` and `next typegen` rewrites them, while tsc includes
 * both. Holders: typecheck's typegen and tsc, production builds, dev-mode journeys and
 * lab:capture. Ordinary `pnpm dev` holds nothing, so verification still runs alongside it.
 *
 * A competing holder fails fast with an actionable conflict instead of waiting. Holders release
 * on success and failure; a holder killed before releasing leaves its pid behind, and the next
 * acquire replaces a lock whose pid is no longer running. A holder passes `lockEnv` to its
 * children, and a nested wrapper inheriting the current token re-enters instead of deadlocking.
 */
export const lockEnv = 'MEDDIES_NEXT_OUTPUT_LOCK'
const lockPath = (root) => join(root, '.cache/next-output.lock')

async function readHolder(path) {
  try {
    return JSON.parse(await readFile(path, 'utf8'))
  } catch (error) {
    if (error.code === 'ENOENT') return undefined
    return {}
  }
}

function isRunning(pid) {
  if (!Number.isInteger(pid)) return false
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return error.code === 'EPERM'
  }
}

/**
 * Takes the lock for `owner` (the command name the conflict message shows), or throws the
 * conflict. Returns the release function and the env to pass to children.
 */
export async function acquireNextOutputLock({ root, owner, env = process.env, pid = process.pid }) {
  const path = lockPath(root)
  const inherited = env[lockEnv]
  if (inherited && (await readHolder(path))?.token === inherited)
    return { env, release: async () => {} }
  await mkdir(join(root, '.cache'), { recursive: true })
  const token = randomUUID()
  // Link a complete file into place: creation is atomic, so readers never see partial JSON.
  const draft = `${path}.${token}`
  await writeFile(draft, JSON.stringify({ owner, pid, token }))
  try {
    for (;;) {
      try {
        await link(draft, path)
        break
      } catch (error) {
        if (error.code !== 'EEXIST') throw error
      }
      const holder = await readHolder(path)
      if (holder && isRunning(holder.pid))
        throw new Error(
          `${holder.owner} (pid ${holder.pid}) is creating or deleting generated Next.js files ` +
            `in this checkout. Rerun ${owner} after it finishes. If no such process is running, ` +
            `delete .cache/next-output.lock.`,
        )
      // Replace a dead holder's lock, unless another acquirer replaced it first.
      if ((await readHolder(path))?.token === holder?.token)
        await unlink(path).catch((error) => {
          if (error.code !== 'ENOENT') throw error
        })
    }
  } finally {
    await unlink(draft)
  }
  return {
    env: { ...env, [lockEnv]: token },
    release: async () => {
      if ((await readHolder(path))?.token === token) await unlink(path)
    },
  }
}

/** Runs `action(env)` holding the lock, releasing it whether the action passes or fails. */
export async function withNextOutputLock(options, action) {
  const { env, release } = await acquireNextOutputLock(options)
  try {
    return await action(env)
  } finally {
    await release()
  }
}
