import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

/**
 * Tooling tests prove scripts, workflows and the journey harness, not product behavior. They
 * form their own Vitest project; CI runs it on every Release, and `pnpm verify:local` runs it
 * only when one of `toolingInputs` changed against origin/main or in the working tree.
 */
export const toolingTests = [
  'tests/architecture-build.test.ts',
  'tests/browser-measure.test.ts',
  'tests/dev-server.test.ts',
  'tests/dev-stack.test.ts',
  'tests/journey-build.test.ts',
  'tests/journey-server.test.ts',
  'tests/journey-worker.test.ts',
  'tests/release-guard.test.ts',
  'tests/release.test.ts',
  'tests/verify.test.ts',
]

// Directory entries end with '/'; the rest match one file exactly.
const toolingInputs = [
  'scripts/',
  '.github/',
  'tests/browser/',
  'tests/helpers/journey-build.mjs',
  'tests/helpers/journey-build.d.mts',
  'playwright.config.ts',
  'vitest.config.mts',
  'package.json',
  'pnpm-lock.yaml',
  ...toolingTests,
]

function isToolingInput(path) {
  return toolingInputs.some((input) =>
    input.endsWith('/') ? path.startsWith(input) : path === input,
  )
}

/**
 * The first changed tooling input, or undefined when none changed. Changes count from the
 * merge base with origin/main through the working tree, untracked files included. Throws when
 * git cannot tell, so the caller runs the project rather than skipping it.
 */
export async function changedToolingInput(root) {
  const git = async (...args) =>
    (await promisify(execFile)('git', args, { cwd: root })).stdout.split('\n').filter(Boolean)
  const [base] = await git('merge-base', 'HEAD', 'origin/main')
  const paths = [
    ...(await git('diff', '--name-only', base)),
    ...(await git('ls-files', '--others', '--exclude-standard')),
  ]
  return paths.find(isToolingInput)
}
