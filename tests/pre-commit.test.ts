import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { test, type TestContext } from 'vitest'

const valid = 'See 999·A1.\n'
const invalid = 'See 999·' + 'A2.\n'

function repository(t: TestContext, initialCitation = valid) {
  const cwd = mkdtempSync(join(tmpdir(), 'meddies-pre-commit-'))
  t.onTestFinished(() => rmSync(cwd, { recursive: true, force: true }))
  const git = (...args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8' })
  const write = (file: string, content: string) => writeFileSync(join(cwd, file), content)
  for (const dir of ['.agents', 'docs', 'src/features/design-lab', 'tests'])
    mkdirSync(join(cwd, dir), { recursive: true })
  for (const file of ['AGENTS.md', 'DESIGN.md', 'PRODUCT.md', '.agents/.keep']) write(file, '')
  write(
    'package.json',
    JSON.stringify({ packageManager: 'pnpm@11.2.2', 'lint-staged': { '*.md': 'node --version' } }),
  )
  write('vitest.config.mjs', "export default { test: { name: 'unit' } }\n")
  write(
    'src/features/design-lab/frames.ts',
    "export const designFrames = [{ citation: '999·A1', slug: '999-a1' }]\n",
  )
  copyFileSync(
    resolve('tests/design-citations.test.ts'),
    join(cwd, 'tests/design-citations.test.ts'),
  )
  symlinkSync(resolve('node_modules'), join(cwd, 'node_modules'), 'dir')
  write('.gitignore', '/node_modules\n')
  write('docs/frame.md', initialCitation)
  git('init', '-q')
  git('add', '.')
  git(
    '-c',
    'core.hooksPath=/dev/null',
    '-c',
    'user.name=Fixture',
    '-c',
    'user.email=fixture@example.com',
    'commit',
    '-qm',
    'Fixture',
  )

  return {
    git,
    write,
    hook: () =>
      spawnSync('sh', ['-e', resolve('.husky/pre-commit')], {
        cwd,
        encoding: 'utf8',
        timeout: 15_000,
      }),
  }
}

test(
  'pre-commit rejects an invalid staged citation fixed in the working tree',
  { timeout: 20_000 },
  (t) => {
    const { git, write, hook } = repository(t)
    write('docs/frame.md', invalid)
    git('add', 'docs/frame.md')
    write('docs/frame.md', valid)

    const result = hook()
    assert.equal(result.status, 1, result.stdout + result.stderr)
    assert.match(result.stdout + result.stderr, /docs\/frame\.md.*is not a registered frame/)
  },
)

test(
  'pre-commit accepts a valid staged citation with an invalid unstaged edit',
  { timeout: 20_000 },
  (t) => {
    const { git, write, hook } = repository(t)
    write('docs/frame.md', 'Build ' + valid)
    git('add', 'docs/frame.md')
    write('docs/frame.md', 'Build ' + invalid)

    const result = hook()
    assert.equal(result.status, 0, result.stdout + result.stderr)
    assert.equal(git('show', ':docs/frame.md'), 'Build ' + valid)
    assert.ok(git('diff', '--', 'docs/frame.md').includes('+Build ' + invalid))
  },
)

test(
  'pre-commit skips citation checks for staged paths outside the scan scope',
  { timeout: 20_000 },
  (t) => {
    const { git, write, hook } = repository(t, invalid)
    write('README.md', 'Outside the scan scope.\n')
    git('add', 'README.md')

    const result = hook()
    assert.equal(result.status, 0, result.stdout + result.stderr)
  },
)
