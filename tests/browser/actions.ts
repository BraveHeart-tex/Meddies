import type { Locator, Page } from '@playwright/test'

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

/**
 * Two clicks in one task, before React can re-render and disable the button, so only a
 * synchronous duplicate-submit lock can stop the second save.
 */
export async function clickTwiceSynchronously(button: Locator) {
  await button.evaluate((element: HTMLElement) => {
    element.click()
    element.click()
  })
}
