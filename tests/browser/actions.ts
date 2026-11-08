import type { Locator, Page } from '@playwright/test'

// Escape hatches for behavior Playwright cannot drive through user-facing APIs.
// page.evaluate is allowed only in this file; give each helper a reason.

/**
 * Visible links can precede hydration; no user-facing API proves the client router owns
 * history. Next.js 16.4.4 sets __NA when its App Router commits the history entry. An
 * upgrade could rename this internal marker, causing this helper to time out instead of
 * silently allowing a full document navigation.
 */
export async function waitForClientRouter(page: Page) {
  await page.waitForFunction(() => window.history.state?.__NA === true)
}

/**
 * A client navigation to a page no `<Link>` reaches. Reads Next.js's router handle, since no
 * user-facing control exists for this route.
 */
export async function routerPush(page: Page, url: string) {
  await page.evaluate((href) => {
    const { next } = window as unknown as { next: { router: { push(href: string): void } } }
    next.router.push(href)
  }, url)
}

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

/** Layout reflow and inner scrolling have no accessible API; inspect the rendered boxes. */
export async function todayReflow(list: Locator, width: number) {
  return list.evaluate((element, viewportWidth) => {
    const rows = Array.from(element.querySelectorAll('li[data-dose-id]'))
    return (
      rows.every((row) => {
        const name = row.querySelector('h4')!
        const badge = row.querySelector('[data-slot="badge"]')!
        const time = row.querySelector('time')!
        const box = name.getBoundingClientRect()
        return (
          name.scrollWidth <= name.clientWidth &&
          row.scrollHeight <= row.clientHeight &&
          box.left > time.getBoundingClientRect().left &&
          (viewportWidth > 360 || badge.getBoundingClientRect().top >= box.bottom)
        )
      }) && element.scrollHeight <= element.clientHeight
    )
  }, width)
}

/** Synthetic text-size probe: Playwright has no browser text-only zoom API. */
export async function enlargeText(page: Page) {
  await page.addStyleTag({ content: 'html { font-size: 200% !important; }' })
}

/** Browser Back scroll restoration has no accessible locator API. */
export async function scrollPosition(page: Page) {
  return page.evaluate(() => window.scrollY)
}

/**
 * Force a real client render error without a product hook. Today's heading formats an
 * Istanbul weekday during rendering; only that platform call throws until restored.
 */
export async function forceTodayRenderError(page: Page) {
  await page.addInitScript(() => {
    const original = Intl.DateTimeFormat
    Object.defineProperty(window, '__restoreDateFormatter', {
      value: () => {
        Intl.DateTimeFormat = original
      },
      configurable: true,
    })
    Intl.DateTimeFormat = new Proxy(original, {
      construct(target, args) {
        const options = args[1] as Intl.DateTimeFormatOptions | undefined
        if (options?.timeZone === 'Europe/Istanbul' && options.weekday === 'long') {
          throw new Error('Synthetic render failure')
        }
        return Reflect.construct(target, args)
      },
    })
  })
}

/** Restore the browser fixture before retrying the failed boundary. */
export async function restoreTodayRendering(page: Page) {
  await page.evaluate(() => {
    const fixtureWindow = window as Window & { __restoreDateFormatter?: () => void }
    fixtureWindow.__restoreDateFormatter?.()
    delete fixtureWindow.__restoreDateFormatter
  })
}

/** Observe live-region text changes; browser APIs cannot report spoken screen-reader output. */
export async function trackSignInAnnouncements(page: Page) {
  await page.addInitScript(() => {
    const announcements: string[] = []
    Object.assign(window, { signInAnnouncements: announcements })
    let previous = ''
    new MutationObserver(() => {
      const status = document.querySelector('main [role="status"]')
      const text = status
        ? Array.from(status.children)
            .filter((child) => child.getAttribute('aria-hidden') !== 'true')
            .map((child) => child.textContent)
            .join(' ')
            .trim()
        : ''
      if (text && text !== previous) announcements.push(text)
      previous = text
    }).observe(document, { childList: true, subtree: true, characterData: true })
  })
}

/** Read the live-region observer above, without claiming real assistive-technology output. */
export async function signInAnnouncements(page: Page) {
  return page.evaluate(
    () => (window as unknown as { signInAnnouncements: string[] }).signInAnnouncements,
  )
}

/** Whether focus draws a ring. Computed outlines and `:focus-visible` have no user-facing API. */
export function focusRing(target: Locator) {
  return target.evaluate((element) => ({
    focusVisible: element.matches(':focus-visible'),
    outline: getComputedStyle(element).outlineStyle,
  }))
}

/**
 * Record the ring of the next Today row heading to take focus, read at the focus event: the
 * closing drawer moves focus on to the row's button straight after.
 */
export async function trackRowHeadingFocus(page: Page) {
  await page.evaluate(() => {
    document.addEventListener('focusin', ({ target }) => {
      if (!(target instanceof HTMLElement) || !target.matches('h4[id^="dose-"]')) return
      ;(window as unknown as { rowHeadingFocus: unknown }).rowHeadingFocus = {
        focusVisible: target.matches(':focus-visible'),
        outline: getComputedStyle(target).outlineStyle,
      }
    })
  })
}

export function rowHeadingFocus(page: Page) {
  return page.evaluate(() => (window as unknown as { rowHeadingFocus: unknown }).rowHeadingFocus)
}

/** Leave nothing focused, as when a focused control is removed; no user action does this alone. */
export async function clearFocus(page: Page) {
  await page.evaluate(() => (document.activeElement as HTMLElement).blur())
}
