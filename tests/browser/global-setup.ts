import { existsSync } from 'node:fs'

// Journeys run against completed builds; fail before any server starts when one is missing.
export default function globalSetup() {
  if (!existsSync('.next/BUILD_ID'))
    throw new Error('Production build missing. Run: pnpm build --webpack')
  if (!existsSync('.worker-build/index.js'))
    throw new Error('Worker bundle missing for storage journeys. Run: pnpm worker:build')
}
