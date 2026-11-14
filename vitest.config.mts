import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
import { toolingTests } from './scripts/tooling-tests.mjs'

// HTTP and Worker integration tests; production HTTP tests also need a Next.js build.
const integration = [
  'tests/auth.test.ts',
  'tests/medicine-storage-*.test.ts',
  'tests/design-lab-http.test.ts',
]

// ESLint rule tests share one module cache, so the repo ESLint config and its plugins load
// once per run instead of once per file. Each file still builds its own ESLint instance.
const lintRules = ['tests/*-lint.test.ts']

export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          environment: 'node',
          include: ['tests/**/*.test.ts'],
          exclude: [...integration, ...toolingTests, ...lintRules],
          testTimeout: 5_000,
          hookTimeout: 5_000,
        },
      },
      {
        extends: true,
        test: {
          name: 'lint-rules',
          environment: 'node',
          include: lintRules,
          isolate: false,
          testTimeout: 5_000,
          hookTimeout: 5_000,
        },
      },
      {
        // Scripts, workflows and journey harness: scripts/tooling-tests.mjs.
        extends: true,
        test: {
          name: 'tooling',
          environment: 'node',
          include: toolingTests,
          testTimeout: 5_000,
          hookTimeout: 5_000,
        },
      },
      {
        // Component tests: React Testing Library under jsdom, network through MSW.
        extends: true,
        test: {
          name: 'component',
          environment: 'jsdom',
          include: ['tests/**/*.test.tsx'],
          setupFiles: ['tests/helpers/component-setup.ts'],
          testTimeout: 5_000,
          hookTimeout: 5_000,
        },
      },
      {
        extends: true,
        test: {
          name: 'integration',
          environment: 'node',
          include: integration,
          testTimeout: 30_000,
          hookTimeout: 30_000,
        },
      },
    ],
  },
})
