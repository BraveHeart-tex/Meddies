import type { Locator, Page } from '@playwright/test'
import { layoutShifts, observeLayoutShifts, type LayoutShiftEntry } from './actions'
import { appHeader } from './locators'

// Layout stability evidence for route journeys. See tests/browser/README.md > Request counts
// and layout shift for what the numbers do and do not cover.

export type Viewport = { width: number; height: number }

/** Viewports retained by existing layout regressions; new checks select relevant widths. */
export const layoutViewports = {
  narrow: { width: 320, height: 740 },
  phone: { width: 402, height: 874 },
} satisfies Record<string, Viewport>

export type Box = { x: number; y: number; width: number; height: number }
/** Element boxes by name; null when the element is missing or hidden. */
export type Boxes = Record<string, Box | null>

const round = (value: number, places = 4) => Math.round(value * 10 ** places) / 10 ** places

/**
 * Sum the layout shifts that started at or after `since` (ms on the document's clock). Shifts
 * within 500ms of user input (`hadRecentInput`) are expected by the user, so they are reported
 * apart and left out of `cumulativeLayoutShift`. Unlike the web-vitals CLS this is a plain sum,
 * not the largest five-second session window, so a long load can only score higher.
 */
export function summarizeLayoutShifts(entries: LayoutShiftEntry[], since: number) {
  const counted = entries.filter((entry) => entry.startTime >= since)
  const sum = (list: LayoutShiftEntry[]) => round(list.reduce((total, e) => total + e.value, 0))
  const fromInput = counted.filter((entry) => entry.hadRecentInput)
  const fromLoad = counted.filter((entry) => !entry.hadRecentInput)
  return {
    cumulativeLayoutShift: sum(fromLoad),
    shifts: fromLoad.length,
    inputShift: sum(fromInput),
    inputShifts: fromInput.length,
  }
}

/** The shell elements whose geometry route tickets compare between fallback and content. */
export const shellElements = (page: Page) => ({
  header: appHeader(page),
  primaryNav: page.getByRole('navigation', { name: 'Primary' }),
})

/** The rounded border box of each element, or null when it is missing or hidden. */
export async function boxes(elements: Record<string, Locator>) {
  const result: Boxes = {}
  for (const [name, locator] of Object.entries(elements)) {
    const box = (await locator.count()) > 0 ? await locator.first().boundingBox() : null
    result[name] = box && {
      x: round(box.x, 1),
      y: round(box.y, 1),
      width: round(box.width, 1),
      height: round(box.height, 1),
    }
  }
  return result
}

/**
 * Track layout shift and element geometry across one load. Sets `viewport` and starts observing
 * before the next document loads, so call it before `page.goto`. For a client navigation, call
 * `start()` just before the click so earlier shifts on the page are left out.
 */
export async function trackLayout(page: Page, viewport: Viewport) {
  await page.setViewportSize(viewport)
  await observeLayoutShifts(page)
  let since = 0
  const snapshots: { stage: string; boxes: Boxes }[] = []
  return {
    async start() {
      since = (await layoutShifts(page)).now
    },
    /** Record element boxes at a named stage, such as `fallback` or `loaded`. */
    async snapshot(stage: string, elements: Record<string, Locator> = shellElements(page)) {
      snapshots.push({ stage, boxes: await boxes(elements) })
    },
    /** Layout shift since the start, with every snapshot so far. */
    async result() {
      const { entries } = await layoutShifts(page)
      return { viewport, ...summarizeLayoutShifts(entries, since), snapshots }
    },
  }
}
