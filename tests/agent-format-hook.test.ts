import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join, relative, resolve } from 'node:path'
import { test, type TestContext } from 'vitest'

// The agent format hook formats what an editor tool wrote, from a Claude Code file path or a
// Codex patch, and fails open. Catches a payload shape it stops reading and a hook that blocks.

const unformatted = 'const value = {a:1,b:"two"};\n'
const formatted = "const value = { a: 1, b: 'two' }\n"

async function scratch(t: TestContext) {
  // Inside the project, outside .gitignore, so Prettier formats it like any agent edit.
  const directory = await mkdtemp(resolve('tests/.agent-format-hook-'))
  t.onTestFinished(() => rm(directory, { recursive: true, force: true }))
  return directory
}

function hook(payload: string) {
  return spawnSync(process.execPath, [resolve('scripts/agent-format-hook.mjs')], {
    input: payload,
    encoding: 'utf8',
    timeout: 20_000,
  })
}

test('a Claude Code Edit or Write payload formats its file', { timeout: 30_000 }, async (t) => {
  const file = join(await scratch(t), 'edited.ts')
  await writeFile(file, unformatted)
  const result = hook(JSON.stringify({ tool_input: { file_path: file } }))
  assert.equal(result.status, 0, result.stderr)
  assert.equal(await readFile(file, 'utf8'), formatted)
})

test('a Codex apply_patch payload formats each patched file', { timeout: 30_000 }, async (t) => {
  const file = join(await scratch(t), 'patched.ts')
  await writeFile(file, unformatted)
  const patch = `*** Begin Patch\n*** Add File: ${relative(process.cwd(), file)}\n*** End Patch`
  const result = hook(JSON.stringify({ cwd: process.cwd(), tool_input: { command: patch } }))
  assert.equal(result.status, 0, result.stderr)
  assert.equal(await readFile(file, 'utf8'), formatted)
})

test('a malformed payload or a file outside the project exits 0', () => {
  assert.equal(hook('not json').status, 0)
  assert.equal(hook(JSON.stringify({ tool_input: { file_path: '/etc/hosts' } })).status, 0)
})
