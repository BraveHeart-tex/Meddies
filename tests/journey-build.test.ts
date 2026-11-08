import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, test } from 'vitest'
import { journeySetupError } from './helpers/journey-build.mjs'

const roots: string[] = []
afterAll(() => Promise.all(roots.map((root) => rm(root, { recursive: true, force: true }))))

const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000)

async function project({ buildAt, worker = true }: { buildAt?: Date; worker?: boolean } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'journey-build-'))
  roots.push(root)
  await mkdir(join(root, 'src/app'), { recursive: true })
  await writeFile(join(root, 'src/app/page.tsx'), '')
  await writeFile(join(root, 'package.json'), '{}')
  for (const path of ['src/app/page.tsx', 'src/app', 'src', 'package.json'])
    await utimes(join(root, path), minutesAgo(10), minutesAgo(10))
  if (buildAt) {
    await mkdir(join(root, '.next'))
    await writeFile(join(root, '.next/BUILD_ID'), 'build')
    await utimes(join(root, '.next/BUILD_ID'), buildAt, buildAt)
  }
  if (worker) {
    await mkdir(join(root, '.worker-build'))
    await writeFile(join(root, '.worker-build/index.js'), '')
  }
  return root
}

test('dev mode is rejected in CI', async () => {
  const root = await project({ buildAt: minutesAgo(5) })
  assert.match(
    (await journeySetupError({ root, env: { CI: 'true', MEDDIES_BROWSER_DEV: '1' } }))!,
    /MEDDIES_BROWSER_DEV is not allowed in CI/,
  )
})

test('a source edit after the build makes the build stale', async () => {
  const root = await project({ buildAt: minutesAgo(5) })
  assert.equal((await journeySetupError({ root, env: {} }))!, undefined)
  await writeFile(join(root, 'src/app/page.tsx'), 'export default 1')
  const error = await journeySetupError({ root, env: {} })
  assert.match(error!, /src\/app\/page\.tsx/)
  assert.match(error!, /pnpm test:browser:build/)
})

test('CI skips the freshness check but still needs a build', async () => {
  const stale = await project({ buildAt: minutesAgo(20) })
  assert.equal((await journeySetupError({ root: stale, env: { CI: 'true' } }))!, undefined)
  const unbuilt = await project()
  assert.match(
    (await journeySetupError({ root: unbuilt, env: { CI: 'true' } }))!,
    /Production build missing/,
  )
})

test('dev mode needs no production build but needs the Worker bundle', async () => {
  const env = { MEDDIES_BROWSER_DEV: '1' }
  assert.equal((await journeySetupError({ root: await project(), env }))!, undefined)
  assert.match(
    (await journeySetupError({ root: await project({ worker: false }), env }))!,
    /Worker bundle missing/,
  )
})

test('deleting a source file makes the build stale', async () => {
  const root = await project({ buildAt: minutesAgo(5) })
  await rm(join(root, 'src/app/page.tsx'))
  assert.match(
    (await journeySetupError({ root, env: {} }))!,
    /src\/app changed after the last build/,
  )
})

test('only MEDDIES_BROWSER_DEV=1 enables dev mode', async () => {
  const root = await project()
  assert.match(
    (await journeySetupError({ root, env: { MEDDIES_BROWSER_DEV: '0' } }))!,
    /Production build missing/,
  )
})
