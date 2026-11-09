import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { test } from 'vitest'

for (const failure of ['build', 'test:unit', 'test:integration', '']) {
  test(`verify collects stage 2 results when ${failure || 'nothing'} fails`, async (t) => {
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
    test "$CI_SKIP_BUILD_TYPECHECK" = 1 || exit 91
    mkdir -p .next
    echo build > .next/BUILD_ID ;;
  test:unit)
    for report; do :; done
    echo '{"testResults":[{"name":"/tests/dev-stack.test.ts","assertionResults":[{"status":"pending"}]}]}' > "$report" ;;
esac
[ "$1" != "$FAIL_CHECK" ]
`,
      { mode: 0o755 },
    )
    const result = spawnSync(process.execPath, [resolve('scripts/verify.mjs')], {
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
    assert.equal(result.status, failure ? 1 : 0, result.stdout + result.stderr)
    const commands = (await readFile(join(root, 'commands'), 'utf8')).trim().split('\n')
    assert.deepEqual(commands.slice(0, 3).sort(), ['format:check', 'lint', 'typecheck'])
    assert.ok(commands.includes('test:unit'))
    assert.equal(commands.includes('test:integration'), failure !== 'build')
    assert.match(result.stdout, /WARNING: dev stack tests skipped/)
    assert.match(result.stdout, /PASS typecheck: [\d.]+s/)
    if (failure) assert.match(result.stdout, /FAIL .*: [\d.]+s/)
  })
}
