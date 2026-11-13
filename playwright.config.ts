import { defineConfig } from '@playwright/test'

// Browser journeys against the production build. Run in CI's Journeys job after its
// Turbopack build; opt-in locally via pnpm test:browser:build, not part of verify:local.
// MEDDIES_BROWSER_DEV=1 runs them against next dev for local iteration only.
export default defineConfig({
  testDir: 'tests/browser',
  testMatch: '*.spec.ts',
  outputDir: '.browser-artifacts',
  globalSetup: './tests/browser/global-setup.ts',
  // Each test owns its Next.js server, port, in-memory D1 and clock file, so spec files run in
  // parallel locally. CI retains its last clean count of one: the 2/3-worker trial found
  // dose drawer flakes (#255). Dev mode shares the .next/dev lock, so it stays serial too.
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
    // Chromium at the iPhone 17 CSS size (402x874, portrait). Synthetic only: not WebKit, iOS
    // or an installed PWA.
    { name: 'phone', use: { viewport: { width: 402, height: 874 } } },
    // Opt-in narrow stress check.
    { name: 'narrow', use: { viewport: { width: 320, height: 740 } } },
  ],
})
