import type { Page, PageScreenshotOptions } from '@playwright/test'
import { finishFiniteAnimations } from './actions'
import { drawerAtRest } from './drawers'
import { drawer } from './locators'

// The one screenshot path for captures the meddies/settled-captures lint rule owns: finish
// finite animations, wait for any visible Drawer to come to rest, then capture with motion
// disabled. No fixed sleeps. Assert real transitions before calling it; this only settles.

/** Screenshot the page once the interface has settled. */
export async function captureSettled(page: Page, options: PageScreenshotOptions) {
  await finishFiniteAnimations(page)
  if (await drawer(page).isVisible()) await drawerAtRest(page)
  return page.screenshot({ animations: 'disabled', ...options })
}
