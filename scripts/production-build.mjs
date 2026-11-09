import { readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import net from 'node:net'
import { staleBuildReason } from '../tests/helpers/journey-build.mjs'

export async function canOpenPort() {
  return new Promise((resolve) => {
    const server = net.createServer()
    server.once('error', () => resolve(false))
    server.listen({ host: '127.0.0.1', port: 0 }, () => server.close(() => resolve(true)))
  })
}

// Invalidate before starting: Next writes BUILD_ID before static generation finishes.
export async function productionBuild({ root = process.cwd(), env = process.env, run }) {
  const stale = await staleBuildReason(root)
  if (!env.CI && !stale) return 'Next.js build fresh, skipped'
  const marker = join(root, '.next/meddies-build-success')
  await rm(marker, { force: true })
  const args = ['build', ...((await canOpenPort()) ? [] : ['--webpack'])]
  await run('pnpm', args)
  await writeFile(marker, await readFile(join(root, '.next/BUILD_ID')))
  return `Next.js ${args.join(' ')}`
}
