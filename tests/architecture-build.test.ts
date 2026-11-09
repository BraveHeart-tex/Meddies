import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { test } from 'vitest'

const exec = promisify(execFile)

test('Next rejects a browser helper reaching marked server code indirectly', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'meddies-architecture-'))
  try {
    await symlink(resolve('node_modules'), join(directory, 'node_modules'), 'dir')
    await mkdir(join(directory, 'app'))
    await writeFile(join(directory, 'package.json'), JSON.stringify({ private: true }))
    await writeFile(join(directory, 'next.config.mjs'), 'export default {}')
    await writeFile(
      join(directory, 'app/layout.js'),
      'export default function Layout({children}) { return <html><body>{children}</body></html> }',
    )
    await writeFile(
      join(directory, 'app/private.js'),
      "import 'server-only'; export const value = 'private'",
    )
    await writeFile(join(directory, 'app/helper.js'), "export { value } from './private.js'")
    await writeFile(
      join(directory, 'app/page.js'),
      "'use client'; import { value } from './helper.js'; export default function Page() { return <p>{value}</p> }",
    )
    const result = await exec(
      process.execPath,
      [resolve('node_modules/next/dist/bin/next'), 'build', '--webpack'],
      {
        cwd: directory,
        env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
        timeout: 60_000,
        maxBuffer: 2_000_000,
      },
    ).then(
      (output) => ({ ...output, failed: false }),
      (error) => ({
        stdout: String(error.stdout),
        stderr: String(error.stderr),
        failed: true,
      }),
    )
    assert.equal(result.failed, true, 'A browser-to-server import must fail the build')
    assert.match(result.stdout + result.stderr, /server-only/)
    assert.match(result.stdout + result.stderr, /helper\.js/)
    assert.match(result.stdout + result.stderr, /Client Component|use client/)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}, 70_000)
