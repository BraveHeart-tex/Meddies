import { defineConfig } from '@playwright/test'

// Manual browser journeys against the production build. Not part of verify:local or CI.
export default defineConfig({
  testDir: 'tests/browser',
  testMatch: '*.spec.ts',
  outputDir: '.browser-artifacts',
  globalSetup: './tests/browser/global-setup.ts',
  workers: 1,
  fullyParallel: false,
  retries: 0,
  forbidOnly: true,
  reporter: [['list']],
  timeout: 60_000,
  expect: { timeout: 5_000 },
  use: {
    browserName: 'chromium',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 5_000,
  },
  projects: [
    // The sole user's device: iPhone 17 portrait, in CSS px.
    { name: 'iphone-17', use: { viewport: { width: 402, height: 874 } } },
    // Opt-in narrow stress check.
    { name: 'narrow', use: { viewport: { width: 320, height: 740 } } },
  ],
})
