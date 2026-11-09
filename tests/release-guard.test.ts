import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve, join } from 'node:path'
import { afterEach, expect, test } from 'vitest'

const script = resolve('scripts/release-guard.mjs')
const directories: string[] = []

function history() {
  const cwd = mkdtempSync(join(tmpdir(), 'release-guard-'))
  directories.push(cwd)
  const git = (...args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim()
  git('init', '-q')
  git('config', 'user.email', 'test@example.com')
  git('config', 'user.name', 'Test')
  function commit(path: string, content = 'content') {
    mkdirSync(resolve(cwd, path, '..'), { recursive: true })
    writeFileSync(join(cwd, path), content)
    git('add', '.')
    git('commit', '-qm', 'change')
    return git('rev-parse', 'HEAD')
  }
  const sha = commit('app.ts')
  const guard = (current = git('rev-parse', 'HEAD'), released = sha) =>
    spawnSync(process.execPath, [script, released, current], { cwd }).status
  return { commit, guard, git, sha }
}

afterEach(() => directories.splice(0).forEach((cwd) => rmSync(cwd, { recursive: true })))

test('allows the current main SHA and docs-only advances', () => {
  const { commit, guard } = history()
  expect(guard()).toBe(0)
  commit('docs/setup.txt')
  commit('README.md')
  commit('nested/notes.md')
  expect(guard()).toBe(0)
})

test('refuses newer code changes even when later reverted', () => {
  const { commit, guard } = history()
  commit('app.ts', 'new code')
  expect(guard()).toBe(1)
  commit('app.ts', 'content')
  expect(guard()).toBe(1)
})

test('refuses unknown or non-descendant history', () => {
  const { commit, guard, git, sha } = history()
  expect(guard('a'.repeat(40))).toBe(1)
  expect(guard('invalid')).toBe(1)
  const newer = commit('README.md')
  expect(guard(sha, newer)).toBe(1)
  git('checkout', '--orphan', 'unrelated')
  const unrelated = commit('other.md')
  expect(guard(unrelated)).toBe(1)
})

test('refuses a code rename into docs', () => {
  const { git, guard } = history()
  git('mv', 'app.ts', 'app.md')
  git('commit', '-qm', 'rename')
  expect(guard()).toBe(1)
})
