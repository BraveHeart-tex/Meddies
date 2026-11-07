import { defineConfig } from '@playwright/test'

// Browser journeys against the production build. Run in CI after scripts/verify.sh
// (Turbopack build); opt-in locally via pnpm test:browser:build, not part of verify:local.
// MEDDIES_BROWSER_DEV=1 runs them against next dev for local iteration only.
export default defineConfig({
  testDir: 'tests/browser',
  testMatch: '*.spec.ts',
  outputDir: '.browser-artifacts',
  globalSetup: './tests/browser/global-setup.ts',
  // Each test owns its Next.js server, port, in-memory D1 and clock file, so spec files run in
  // parallel locally. CI keeps one worker for its smaller runner; dev mode shares the
  // .next/dev lock, so it stays serial too.
  workers: process.env.CI || process.env.MEDDIES_BROWSER_DEV === '1' ? 1 : 3,
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
