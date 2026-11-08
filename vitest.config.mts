import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

// Tests that load the Worker bundle (`.worker-build`, from `pnpm worker:build`).
const integration = ['tests/auth.test.ts', 'tests/medicine-storage.test.ts']

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
          exclude: integration,
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
