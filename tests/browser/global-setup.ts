// Journeys run against a fresh completed build, or `next dev` with MEDDIES_BROWSER_DEV=1;
// fail before any server starts otherwise.
export default async function globalSetup() {
  // Dynamic import: Playwright loads TypeScript as CommonJS.
  const { journeySetupError } = await import('../helpers/journey-build.mjs')
  const error = await journeySetupError({ root: process.cwd(), env: process.env })
  if (error) throw new Error(error)
}
