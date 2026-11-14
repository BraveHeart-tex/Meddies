import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { test, type TestContext } from 'vitest'

// A fake pnpm in a temporary root records each command and whether the tooling project ran.
// The build fails unless unit tests already finished, failed or not, so a parallel start fails.
async function fakeRoot(t: TestContext) {
  const root = await mkdtemp(join(tmpdir(), 'verify-stages-'))
  t.onTestFinished(() => rm(root, { recursive: true, force: true }))
  await writeFile(
    join(root, 'pnpm'),
    `#!/bin/sh
printf '%s\\n' "$1" >> "$COMMAND_LOG"
case "$1" in
  typecheck) touch types-finished ;;
  build)
    test -f types-finished || exit 90
    test -f unit-finished || exit 92
    test "$CI_SKIP_BUILD_TYPECHECK" = 1 || exit 91
    mkdir -p .next
    echo build > .next/BUILD_ID ;;
  test:unit)
    case " $* " in *" --project tooling "*) touch tooling-ran ;; esac
    for report; do :; done
    echo '{"testResults":[{"name":"/tests/dev-stack.test.ts","assertionResults":[{"status":"pending"}]}]}' > "$report"
    sleep 0.2
    touch unit-finished ;;
esac
[ "$1" != "$FAIL_CHECK" ]
`,
    { mode: 0o755 },
  )
  return root
}

function verify(root: string, failure = '') {
  return spawnSync(process.execPath, [resolve('scripts/verify.mjs')], {
    cwd: root,
    encoding: 'utf8',
    env: {
      ...process.env,
      CI: '',
      PATH: `${root}:${process.env.PATH}`,
      COMMAND_LOG: join(root, 'commands'),
      FAIL_CHECK: failure,
    },
  })
}

for (const failure of ['build', 'test:unit', 'test:integration', '']) {
  test(`verify collects stage 2 results when ${failure || 'nothing'} fails`, async (t) => {
    const root = await fakeRoot(t)
    const result = verify(root, failure)
    assert.equal(result.status, failure ? 1 : 0, result.stdout + result.stderr)
    const commands = (await readFile(join(root, 'commands'), 'utf8')).trim().split('\n')
    assert.deepEqual(commands.slice(0, 3).sort(), ['format:check', 'lint', 'typecheck'])
    const stage2 =
      failure === 'build' ? ['test:unit', 'build'] : ['test:unit', 'build', 'test:integration']
    assert.deepEqual(commands.slice(3), stage2)
    assert.match(result.stdout, failure === 'build' ? /FAIL build/ : /PASS build/)
    if (failure === 'test:unit') assert.match(result.stdout, /PASS integration/)
    assert.match(result.stdout, /WARNING: dev stack tests skipped/)
    assert.match(result.stdout, /PASS typecheck: [\d.]+s/)
    assert.match(result.stdout, /Tooling tests run: changes against origin\/main are unknown/)
    if (failure) assert.match(result.stdout, /FAIL .*: [\d.]+s/)
  })
}

// Outside a git checkout the changes are unknown, so the stage tests above run tooling.
for (const [path, change, runs] of [
  ['src/app.ts', 'committed', false],
  ['docs/notes.md', 'untracked', false],
  ['scripts/verify.mjs', 'committed', true],
  ['vitest.config.mts', 'modified', true],
  ['tests/browser/example.spec.ts', 'untracked', true],
  ['tests/verify.test.ts', 'committed', true],
] as const) {
  test(`verify ${runs ? 'runs' : 'skips'} tooling for a ${change} ${path}`, async (t) => {
    const root = await fakeRoot(t)
    const git = (...args: string[]) => execFileSync('git', args, { cwd: root })
    const write = async (content: string) => {
      await mkdir(dirname(join(root, path)), { recursive: true })
      await writeFile(join(root, path), content)
    }
    git('init', '-q')
    git('config', 'user.email', 'test@example.com')
    git('config', 'user.name', 'Test')
    if (change === 'modified') await write('base')
    git('add', '-A')
    git('commit', '-qm', 'base')
    git('update-ref', 'refs/remotes/origin/main', 'HEAD')
    await write('change')
    if (change === 'committed') {
      git('add', '-A')
      git('commit', '-qm', 'change')
    }
    const result = verify(root)
    assert.equal(result.status, 0, result.stdout + result.stderr)
    const ran = await access(join(root, 'tooling-ran')).then(
      () => true,
      () => false,
    )
    assert.equal(ran, runs)
    if (runs) assert.match(result.stdout, /PASS unit, component and tooling/)
    else assert.match(result.stdout, /SKIP tooling: no script/)
  })
}
