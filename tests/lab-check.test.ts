import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, stat, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { test, type TestContext } from 'vitest'

async function fixture(t: TestContext) {
  const root = await mkdtemp(join(tmpdir(), 'lab-check-'))
  t.onTestFinished(() => rm(root, { recursive: true, force: true }))
  const commands = join(root, 'commands')
  await writeFile(
    join(root, 'pnpm'),
    `#!/bin/sh
printf '%s\\n' "$*" >> commands
case "$1" in
  build)
    test -n "$MEDDIES_NEXT_OUTPUT_LOCK" && test -f .cache/next-output.lock || exit 90
    printf '%s\\n' "$MEDDIES_NEXT_OUTPUT_LOCK" > build-lock
    [ "$LAB_CHECK_FAIL" != build ] || exit 7
    mkdir -p .next
    echo build > .next/BUILD_ID ;;
  exec)
    if [ "$5" = integration ]; then
      test -n "$MEDDIES_NEXT_OUTPUT_LOCK" && test -f .cache/next-output.lock || exit 91
      if [ -f build-lock ]; then
        [ "$(cat build-lock)" = "$MEDDIES_NEXT_OUTPUT_LOCK" ] || exit 92
      fi
    fi
    [ "$5" != "$LAB_CHECK_FAIL" ] || exit 7 ;;
esac
`,
    { mode: 0o755 },
  )
  async function check(failure = '') {
    await writeFile(commands, '')
    await rm(join(root, 'build-lock'), { force: true })
    const result = spawnSync(process.execPath, [resolve('scripts/lab-check.mjs')], {
      cwd: root,
      encoding: 'utf8',
      env: { ...process.env, CI: '', LAB_CHECK_FAIL: failure, PATH: `${root}:${process.env.PATH}` },
    })
    assert.ok(
      result.status !== null && (failure ? result.status > 0 : result.status === 0),
      result.stdout + result.stderr,
    )
    await assert.rejects(stat(join(root, '.cache/next-output.lock')), { code: 'ENOENT' })
    return (await readFile(commands, 'utf8')).trim().split('\n')
  }
  return { root, check }
}

const suites = [
  'exec vitest run --project integration tests/design-lab-http.test.ts',
  'exec vitest run --project unit tests/design-citations.test.ts',
]

function assertBuildThenSuites([build, ...checks]: string[]) {
  assert.match(build, /^build(?: --webpack)?$/)
  assert.deepEqual(checks, suites)
}

test('lab:check builds missing output under the HTTP lock and reuses fresh output', async (t) => {
  const { check } = await fixture(t)
  assertBuildThenSuites(await check())
  assert.deepEqual(await check(), suites)
})

test('lab:check rebuilds when the last build did not complete', async (t) => {
  const { root, check } = await fixture(t)
  await mkdir(join(root, '.next'))
  await writeFile(join(root, '.next/BUILD_ID'), 'partial')

  assertBuildThenSuites(await check())
})

test('lab:check rebuilds after a build input is removed', async (t) => {
  const { root, check } = await fixture(t)
  const input = join(root, 'src/page.tsx')
  await mkdir(join(root, 'src'))
  await writeFile(input, '')
  await check()
  const previousBuild = new Date(Date.now() - 60_000)
  await utimes(join(root, '.next/meddies-build-success'), previousBuild, previousBuild)
  for (const path of [input, join(root, 'src')]) {
    await utimes(path, previousBuild, previousBuild)
  }
  assert.deepEqual(await check(), suites)

  await rm(input)

  assertBuildThenSuites(await check())
})

test('lab:check fails before testing incomplete output when the build fails', async (t) => {
  const { check } = await fixture(t)
  const commands = await check('build')
  assert.equal(commands.length, 1)
  assert.match(commands[0], /^build(?: --webpack)?$/)
})

for (const project of ['integration', 'unit']) {
  test(`lab:check runs both suites and fails when the ${project} suite fails`, async (t) => {
    const { check } = await fixture(t)
    assertBuildThenSuites(await check(project))
  })
}
