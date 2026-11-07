import type { Locator, Page } from '@playwright/test'

// Escape hatches for behavior Playwright cannot drive through user-facing APIs.
// page.evaluate is allowed only in this file; give each helper a reason.

/**
 * Today, the session boundary and stale Query reads refresh on window focus. A headless
 * page never gains or loses OS focus, so dispatch the event the app listens for. A FocusEvent,
 * like the browser's, carries the `relatedTarget` the Toast viewport reads.
 */
export async function focusWindow(page: Page) {
  await page.evaluate(() => window.dispatchEvent(new FocusEvent('focus')))
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

/** One `layout-shift` performance entry, as the Layout Instability API reports it. */
export type LayoutShiftEntry = { value: number; startTime: number; hadRecentInput: boolean }

/**
 * Layout shift has no Playwright API, so record the browser's `layout-shift` entries from the
 * start of every document the page loads. Chromium only (the Layout Instability API).
 */
export async function observeLayoutShifts(page: Page) {
  await page.addInitScript(() => {
    const target = window as unknown as { __meddiesLayoutShifts?: LayoutShiftEntry[] }
    // Each call adds an init script; only the first observes, so entries are not doubled.
    if (target.__meddiesLayoutShifts) return
    const entries: LayoutShiftEntry[] = (target.__meddiesLayoutShifts = [])
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as unknown as LayoutShiftEntry[])
        entries.push({
          value: entry.value,
          startTime: entry.startTime,
          hadRecentInput: entry.hadRecentInput,
        })
    }).observe({ type: 'layout-shift', buffered: true })
  })
}

/**
 * The current document's layout-shift entries and clock, recorded by `observeLayoutShifts`.
 * They live in page memory, which no Playwright API reads.
 */
export async function layoutShifts(page: Page) {
  return page.evaluate(() => ({
    now: performance.now(),
    entries: [
      ...((window as unknown as { __meddiesLayoutShifts?: LayoutShiftEntry[] })
        .__meddiesLayoutShifts ?? []),
    ],
  }))
}

/**
 * Whether every stylesheet and web font has loaded. A held stream never fires `load`, and under
 * `next dev` the first paint after `commit` can come before the CSS, so measuring then is wrong.
 */
export async function stylesheetsLoaded(page: Page) {
  return page.evaluate(
    () =>
      document.fonts.status === 'loaded' &&
      [...document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')].every(
        (link) => link.sheet !== null,
      ),
  )
}
