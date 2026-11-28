// PostToolUse hook for Claude Code (Edit, Write) and Codex (apply_patch, Edit, Write): formats
// each project file the tool wrote with ESLint layout fixes, then Prettier, so `pnpm verify:local`
// does not fail on formatting. Layout fixes only, so a `problem` fix never removes an import the
// agent added but has not used yet. It fails open: a formatter error never blocks the agent.
// Files edited from a shell are formatted by scripts/verify.mjs instead.
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const patchPath = /^\*\*\* (?:Add File|Update File|Move to): (.+)$/gm
const linted = /\.(?:[cm]?js|jsx|tsx?)$/

try {
  const payload = JSON.parse(readFileSync(0, 'utf8') || '{}')
  const input = payload.tool_input ?? {}
  const base = payload.cwd ?? root
  const paths = new Set([payload.tool_response?.filePath, input.file_path].filter(Boolean))
  const patch = [input.command, input.patch, input.input]
    .filter((value) => typeof value === 'string')
    .join('\n')
  for (const [, path] of patch.matchAll(patchPath)) paths.add(path.trim())

  const files = [...paths]
    .map((path) => (isAbsolute(path) ? path : resolve(base, path)))
    .filter((path) => {
      const inside = relative(root, path)
      return inside && !inside.startsWith('..') && !isAbsolute(inside) && existsSync(path)
    })

  const lintable = files.filter((path) => linted.test(path))
  // Exits nonzero while unfixable errors remain; those are for verification to report.
  if (lintable.length > 0)
    spawnSync(
      join(root, 'node_modules', '.bin', 'eslint'),
      ['--fix', '--fix-type', 'layout', '--no-warn-ignored', ...lintable],
      { cwd: root, stdio: 'ignore' },
    )
  if (files.length > 0)
    execFileSync(
      join(root, 'node_modules', '.bin', 'prettier'),
      ['--write', '--ignore-unknown', '--log-level', 'warn', ...files],
      { cwd: root, stdio: ['ignore', 'ignore', 'inherit'] },
    )
} catch {
  // Fail open.
}
