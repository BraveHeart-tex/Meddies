import type { Page } from '@playwright/test'

// Escape hatches for behavior Playwright cannot drive through user-facing APIs.
// page.evaluate is allowed only in this file; give each helper a reason.

/**
 * Today and the session boundary refresh on window focus. A headless page never
 * gains or loses OS focus, so dispatch the event the app listens for.
 */
export async function focusWindow(page: Page) {
  await page.evaluate(() => window.dispatchEvent(new Event('focus')))
}

/** Reflow check: no locator exposes document scroll width. */
export async function scrollsHorizontally(page: Page) {
  return page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  )
}
