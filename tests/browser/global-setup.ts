// Journeys run against a fresh completed build, or `next dev` with MEDDIES_BROWSER_DEV=1;
// fail before any server starts otherwise. Dev mode restarts `next dev`, which wipes
// `.next/dev`, so it holds the generated Next.js files lock until teardown.
export default async function globalSetup() {
  // Dynamic import: Playwright loads TypeScript as CommonJS.
  const { isBrowserDevMode, journeySetupError } = await import('../helpers/journey-build.mjs')
  const error = await journeySetupError({ root: process.cwd(), env: process.env })
  if (error) throw new Error(error)
  if (!isBrowserDevMode(process.env)) return
  const { acquireNextOutputLock } = await import('../../scripts/next-output-lock.mjs')
  const { release } = await acquireNextOutputLock({
    root: process.cwd(),
    owner: 'dev-mode journeys (MEDDIES_BROWSER_DEV=1)',
  })
  return release
}
