/**
 * Tooling tests prove scripts, workflows and the journey harness, not product behavior. They
 * form their own Vitest project. Local verification and CI run every suite, regardless of Git
 * impact: indirect inputs include dynamically loaded helpers, migration SQL, bundled Worker
 * source and runtime configuration. No tooling checks are CI-only.
 */
export const toolingTests = [
  'tests/agent-format-hook.test.ts',
  'tests/architecture-build.test.ts',
  'tests/browser-measure.test.ts',
  'tests/catalog-migration.test.ts',
  'tests/create-issue.test.ts',
  'tests/dev-server.test.ts',
  'tests/dev-stack.test.ts',
  'tests/journey-build.test.ts',
  'tests/journey-server.test.ts',
  'tests/journey-worker.test.ts',
  'tests/lab-capture.test.ts',
  'tests/next-output-lock.test.ts',
  'tests/release-guard.test.ts',
  'tests/release.test.ts',
  'tests/start-issue.test.ts',
  'tests/verify.test.ts',
]
