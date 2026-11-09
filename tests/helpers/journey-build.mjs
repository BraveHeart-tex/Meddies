import { readFile, readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'

// Files and directories whose changes the production Next.js build depends on.
// Directory mtimes count too, so deleting or renaming a file marks the build stale.
const buildInputs = [
  'src',
  'public',
  'next.config.ts',
  'tsconfig.json',
  'postcss.config.mjs',
  'package.json',
  'pnpm-lock.yaml',
  // Next.js inlines env values at build time.
  '.env',
  '.env.local',
  '.env.production',
  '.env.production.local',
]

async function statOrUndefined(path) {
  try {
    return await stat(path)
  } catch (error) {
    if (error.code === 'ENOENT') return undefined
    throw error
  }
}

const mtime = async (path) => (await statOrUndefined(path))?.mtimeMs

/** The most recently modified build input, as a root-relative path and mtime. */
async function newestBuildInput(root) {
  let newest
  const consider = (path, mtimeMs) => {
    if (mtimeMs !== undefined && (!newest || mtimeMs > newest.mtimeMs)) newest = { path, mtimeMs }
  }
  for (const input of buildInputs) {
    const path = join(root, input)
    const info = await statOrUndefined(path)
    if (!info) continue
    consider(input, info.mtimeMs)
    if (!info.isDirectory()) continue
    for (const entry of await readdir(path, { recursive: true })) {
      const relative = join(input, entry)
      consider(relative, await mtime(join(root, relative)))
    }
  }
  return newest
}

/** Why the production Next.js build is stale, or undefined when it is fresh. */
export async function staleBuildReason(root) {
  const marker = join(root, '.next/meddies-build-success')
  const builtAt = await mtime(marker)
  if (builtAt === undefined) return 'no successful production build'
  try {
    if ((await readFile(marker, 'utf8')) !== (await readFile(join(root, '.next/BUILD_ID'), 'utf8')))
      return 'production build replaced outside the wrapper'
  } catch (error) {
    if (error.code === 'ENOENT') return 'no production build'
    throw error
  }
  const newest = await newestBuildInput(root)
  if (newest && newest.mtimeMs > builtAt) return `${newest.path} changed after the last build`
}

/** MEDDIES_BROWSER_DEV=1: journeys spawn `next dev --webpack` instead of `next start`. */
export const isBrowserDevMode = (env) => env.MEDDIES_BROWSER_DEV === '1'

/**
 * Why journeys cannot start, or undefined. Dev mode (MEDDIES_BROWSER_DEV) needs no
 * production build and is rejected in CI. CI trusts the build from the same job.
 */
export async function journeySetupError({ root, env }) {
  const dev = isBrowserDevMode(env)
  if (env.CI && dev)
    return 'MEDDIES_BROWSER_DEV is not allowed in CI; journeys there use the production build'
  if ((await mtime(join(root, '.worker-build/index.js'))) === undefined)
    return 'Worker bundle missing for storage journeys. Run: pnpm worker:build'
  if (dev) return
  if ((await mtime(join(root, '.next/BUILD_ID'))) === undefined)
    return 'Production build missing. Run: pnpm test:browser:build'
  if (env.CI) return
  const stale = await staleBuildReason(root)
  if (stale) return `Production build is stale: ${stale}. Run: pnpm test:browser:build`
}
