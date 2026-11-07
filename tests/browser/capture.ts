import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { Locator, Page } from '@playwright/test'
import { scrollsHorizontally, stylesheetsLoaded } from './actions'
import { expect } from './fixtures'
import { boxes, layoutViewports, shellElements, type Boxes, type Viewport } from './layout'
import type { WorkerControls } from './worker-proxy'

// Loading evidence for design review: fallback and loaded screenshots plus a JSON summary.
// Never a CI assertion; loading-capture.spec.ts runs it only with MEDDIES_VISUAL_OUT set.

/** 402px (iPhone 17), 320px, and 200% zoom of the iPhone 17 viewport (DESIGN.md). */
export const captureViewports = {
  w402: layoutViewports.iphone17,
  w320: layoutViewports.narrow,
  zoom200: { width: 201, height: 437 },
} satisfies Record<string, Viewport>

export type CaptureRoute = {
  /** File name prefix, such as `today`. */
  name: string
  path: string
  /** Visible while the Worker reads are held. */
  fallback: (page: Page) => Locator
  /** Visible once the reads are released. */
  content: (page: Page) => Locator
}

export type CaptureEntry = {
  route: string
  path: string
  stage: 'fallback' | 'loaded'
  viewport: string
  reducedMotion: 'reduce' | 'no-preference'
  screenshot: string
  statusLabels: string[]
  horizontalOverflow: boolean
  boxes: Boxes
}

// Routes match by path prefix, so this holds every Worker read. Auth is a JWT and never reaches
// the Worker.
const holdAll = { method: 'POST', path: '/' }

async function measure(page: Page) {
  // Status labels are visually hidden text, so read text content rather than visible text.
  const statusLabels = (await page.getByRole('status').allTextContents())
    .map((text) => text.trim())
    .filter(Boolean)
  return {
    statusLabels,
    horizontalOverflow: await scrollsHorizontally(page),
    boxes: await boxes(shellElements(page)),
  }
}

/**
 * For each route, viewport and reduced-motion setting: hold every Worker read, load the route,
 * wait for stylesheets and fonts, then screenshot and measure the fallback; release, and do the
 * same for the loaded page. Writes `<name>-<stage>-<viewport>-<motion>.png` and
 * `loading-capture.json` to `out`, and returns the summary.
 */
export async function captureLoading(
  page: Page,
  worker: WorkerControls,
  routes: CaptureRoute[],
  out: string,
) {
  await mkdir(out, { recursive: true })
  const summary: CaptureEntry[] = []
  for (const route of routes)
    for (const [viewportName, viewport] of Object.entries(captureViewports))
      for (const reducedMotion of ['reduce', 'no-preference'] as const) {
        await page.setViewportSize(viewport)
        await page.emulateMedia({ reducedMotion })
        const motion = reducedMotion === 'reduce' ? 'reduced' : 'motion'
        const shoot = async (stage: CaptureEntry['stage']) => {
          await expect
            .poll(() => stylesheetsLoaded(page), { message: 'stylesheets should load' })
            .toBe(true)
          const screenshot = `${route.name}-${stage}-${viewportName}-${motion}.png`
          await page.screenshot({ path: resolve(out, screenshot) })
          summary.push({
            route: route.name,
            path: route.path,
            stage,
            viewport: `${viewport.width}x${viewport.height}`,
            reducedMotion,
            screenshot,
            ...(await measure(page)),
          })
        }
        worker.hold(holdAll)
        await page.goto(route.path, { waitUntil: 'commit' })
        await expect(route.fallback(page)).toBeVisible()
        await shoot('fallback')
        worker.release()
        await expect(route.content(page)).toBeVisible()
        await expect(route.fallback(page)).toHaveCount(0)
        await shoot('loaded')
      }
  await writeFile(resolve(out, 'loading-capture.json'), `${JSON.stringify(summary, null, 2)}\n`)
  return summary
}
