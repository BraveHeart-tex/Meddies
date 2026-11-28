import assert from 'node:assert/strict'
import { execFileSync, spawn, spawnSync } from 'node:child_process'
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
printf 'verbose stdout for %s\\n' "$1"
printf 'verbose stderr for %s\\n' "$1" >&2
case "$HOLD_CHECK:$1" in
  static:lint|static:format:check|static:typecheck)
    while [ ! -f release ]; do sleep 0.02; done ;;
esac
case "$1" in
  exec) printf '%s\\n' "$*" > exec-args ;;
  typecheck) touch types-finished ;;
  build)
    test -f types-finished || exit 90
    test -f unit-finished || exit 92
    test "$CI_SKIP_BUILD_TYPECHECK" = 1 || exit 91
    mkdir -p .next
    echo build > .next/BUILD_ID ;;
  test:unit)
    if [ "$FAIL_CHECK" = signal-before-report ]; then kill -TERM $$; fi
    case " $* " in *" --project tooling "*) touch tooling-ran ;; esac
    for report; do :; done
    echo '{"testResults":[{"name":"/tests/dev-stack.test.ts","assertionResults":[{"status":"pending"}]}]}' > "$report"
    sleep 0.2
    touch unit-finished
    if [ "$FAIL_CHECK" = signal ]; then kill -TERM $$; fi ;;
esac
[ "$1" != "$FAIL_CHECK" ]
`,
    { mode: 0o755 },
  )
  return root
}

function verify(root: string, failure = '', ci = '') {
  return spawnSync(process.execPath, [resolve('scripts/verify.mjs')], {
    cwd: root,
    encoding: 'utf8',
    env: {
      ...process.env,
      CI: ci,
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
    assert.match(
      result.stdout,
      /Tooling policy: all suites are required locally; no CI-only tooling checks/,
    )
    if (failure) assert.match(result.stdout, /FAIL .*: [\d.]+s/)
  })
}

// Tooling coverage is independent of Git impact, including unknown history above.
for (const [path, change] of [
  ['src/app.ts', 'committed'],
  ['docs/notes.md', 'untracked'],
  ['tests/helpers/d1-migrations.mjs', 'committed'],
  ['worker/migrations/0001.sql', 'untracked'],
  ['worker/wrangler.jsonc', 'modified'],
  ['scripts/verify.mjs', 'committed'],
  ['vitest.config.mts', 'modified'],
  ['tests/browser/example.spec.ts', 'untracked'],
  ['tests/verify.test.ts', 'committed'],
  ['src/app.ts', 'unchanged'],
] as const) {
  test(`verify runs tooling for a ${change} ${path}`, async (t) => {
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
    if (change !== 'unchanged') await write('change')
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
    assert.equal(ran, true)
    assert.match(result.stdout, /PASS unit, component and tooling/)
    assert.doesNotMatch(result.stdout, /SKIP tooling/)
  })
}

async function heldVerify(t: TestContext, root: string) {
  const child = spawn(process.execPath, [resolve('scripts/verify.mjs')], {
    cwd: root,
    env: {
      ...process.env,
      CI: '',
      PATH: `${root}:${process.env.PATH}`,
      COMMAND_LOG: join(root, 'commands'),
      HOLD_CHECK: 'static',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  t.onTestFinished(async () => {
    await writeFile(join(root, 'release'), '')
    child.kill('SIGKILL')
  })
  let output = ''
  child.stdout.on('data', (data) => {
    output += data.toString()
  })
  const finished = new Promise<number | null>((resolve) => child.on('close', resolve))
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(output || 'no stage progress')), 3000)
    const inspect = () => {
      if (
        ['lint', 'format', 'typecheck'].every((label) => output.includes(`[verify] START ${label}`))
      ) {
        clearTimeout(timeout)
        child.stdout.off('data', inspect)
        resolve()
      }
    }
    child.stdout.on('data', inspect)
    inspect()
  })
  return { child, output: () => output, finished }
}

test('held static children expose live starts before completion and keep ordered results', async (t) => {
  const root = await fakeRoot(t)
  const held = await heldVerify(t, root)
  assert.doesNotMatch(held.output(), /\[verify\] PASS|\[verify\] FAIL|Summary/)
  await writeFile(join(root, 'release'), '')
  assert.equal(await held.finished, 0, held.output())
  const output = held.output()
  assert.match(output, /\[verify\] PASS lint: [\d.]+s/)
  assert.match(output, /\[verify\] Summary/)
  assert.ok(output.indexOf('PASS unit, component and tooling:') < output.indexOf('START build'))
  assert.ok(output.indexOf('PASS build:') < output.indexOf('START integration'))
})

for (const failure of ['signal', 'signal-before-report']) {
  test(`${failure} is explicit and retains diagnostics without console flooding`, async (t) => {
    const root = await fakeRoot(t)
    const result = verify(root, failure)
    assert.equal(result.status, 1)
    assert.match(result.stdout, /unit, component and tooling.*SIGTERM/)
    assert.doesNotMatch(result.stdout, /verbose stdout|verbose stderr/)
    const log = result.stdout.match(/START unit, component and tooling \(log: (.+)\)/)?.[1]
    assert.ok(log, result.stdout)
    const diagnostics = await readFile(log, 'utf8')
    assert.match(diagnostics, /verbose stdout for test:unit/)
    assert.match(diagnostics, /verbose stderr for test:unit/)
    assert.match(diagnostics, /SIGTERM/)
    assert.match(diagnostics, /pnpm exited SIGTERM/)
    assert.doesNotMatch(diagnostics, /ENOENT/)
    assert.match(result.stdout, failure === 'signal' ? /PASS integration/ : /FAIL build/)
  })
}

test('runner SIGTERM names every interrupted static stage and retains their diagnostics', async (t) => {
  const root = await fakeRoot(t)
  const held = await heldVerify(t, root)
  // Each child writes before holding. Wait for those public diagnostic logs to be populated.
  const logs = [...held.output().matchAll(/START (.+) \(log: (.+)\)/g)]
  for (const [, , path] of logs) {
    for (let attempt = 0; ; attempt++) {
      if ((await readFile(path, 'utf8')).includes('verbose stderr')) break
      assert.ok(attempt < 100, `child did not write diagnostics: ${path}`)
      await new Promise((resolve) => setTimeout(resolve, 20))
    }
  }
  held.child.kill('SIGTERM')
  assert.equal(await held.finished, 143, held.output())
  const output = held.output()
  assert.match(output, /runner received SIGTERM/)
  for (const [, label, path] of logs) {
    assert.ok(output.includes(`interrupted ${label}`), output)
    const diagnostics = await readFile(path, 'utf8')
    assert.match(diagnostics, /verbose stdout/)
    assert.match(diagnostics, /verbose stderr/)
    assert.match(diagnostics, /SIGTERM/)
  }
  assert.doesNotMatch(output, /START unit|START build|START integration/)
  assert.match(
    output,
    /SKIP unit, component and tooling: static checks failed or runner interrupted/,
  )
  assert.match(output, /Summary/)
  assert.match(output, /\[verify\] FAIL/)
})

// Shell edits miss the agent format hook, so local runs format uncommitted files first; CI never
// writes. Catches a check failing on formatting a local run could fix, and CI rewriting files.
for (const ci of ['', 'true']) {
  test(`verify ${ci ? 'in CI leaves files alone' : 'locally formats only uncommitted files'}`, async (t) => {
    const root = await fakeRoot(t)
    const git = (...args: string[]) => execFileSync('git', args, { cwd: root })
    git('init', '-q')
    git('config', 'user.email', 'test@example.com')
    git('config', 'user.name', 'Test')
    await writeFile(join(root, 'committed.ts'), 'base')
    await writeFile(join(root, 'deleted.ts'), 'base')
    git('add', '-A')
    git('commit', '-qm', 'base')
    await writeFile(join(root, 'committed.ts'), 'change')
    await rm(join(root, 'deleted.ts'))
    await writeFile(join(root, 'untracked.ts'), 'new')
    const result = verify(root, '', ci)
    assert.equal(result.status, 0, result.stdout + result.stderr)
    const commands = (await readFile(join(root, 'commands'), 'utf8')).trim().split('\n')
    if (ci) {
      assert.equal(commands.includes('exec'), false)
      return
    }
    assert.equal(commands[0], 'exec')
    const args = (await readFile(join(root, 'exec-args'), 'utf8')).trim().split(' ')
    assert.deepEqual(args.slice(0, 3), ['exec', 'prettier', '--write'])
    assert.deepEqual(args.filter((arg) => arg.endsWith('.ts')).sort(), [
      'committed.ts',
      'untracked.ts',
    ])
    assert.match(result.stdout, /Formatted 2 changed files/)
  })
}
