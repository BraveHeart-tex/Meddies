import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { Locator, Page } from '@playwright/test'
import { scrollsHorizontally, stylesheetsLoaded } from './actions'
import { expect } from './fixtures'
import { boxes, layoutViewports, shellElements, type Boxes, type Viewport } from './layout'
import type { WorkerControls, WorkerRoute } from './worker-proxy'

// Loading evidence for design review: fallback and loaded screenshots plus a JSON summary.
// Never a CI assertion; loading-capture.spec.ts runs it only with MEDDIES_VISUAL_OUT set.

export type CaptureCase = {
  name: string
  viewport: Viewport
  reducedMotion: 'reduce' | 'no-preference'
}

/** Focused cases, never an automatic viewport × motion matrix. No case emulates zoom. */
export const captureCases = {
  phone: { name: 'phone', viewport: layoutViewports.phone, reducedMotion: 'no-preference' },
  narrow: { name: 'narrow', viewport: layoutViewports.narrow, reducedMotion: 'no-preference' },
  'reduced-motion': {
    name: 'reduced-motion',
    viewport: layoutViewports.phone,
    reducedMotion: 'reduce',
  },
} satisfies Record<string, CaptureCase>

export type CaptureRoute = {
  /** File name prefix, such as `today`. */
  name: string
  path: string
  /** What to hold instead of every Worker read, for a route fallback ahead of those reads. */
  hold?: WorkerRoute
  /** Visible while the reads or `hold` are held. */
  fallback: (page: Page) => Locator
  /** Visible once the reads are released. */
  content: (page: Page) => Locator
}

export type CaptureEntry = {
  captureCase: string
  route: string
  path: string
  stage: 'fallback' | 'loaded' | 'rendered'
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
 * For each selected route and explicit case: hold its `hold` or every Worker read, load the route,
 * wait for stylesheets and fonts, then screenshot and measure the fallback; release, and do the
 * same for the loaded page. Writes `<name>-<stage>-<case>.png` and
 * `loading-capture.json` to `out`, and returns the summary.
 */
export async function captureLoading(
  page: Page,
  worker: WorkerControls,
  routes: CaptureRoute[],
  out: string,
  cases: readonly CaptureCase[] = [captureCases.phone],
) {
  await mkdir(out, { recursive: true })
  const summary: CaptureEntry[] = []
  for (const route of routes)
    for (const { name, viewport, reducedMotion } of cases) {
      await page.setViewportSize(viewport)
      await page.emulateMedia({ reducedMotion })
      worker.hold(route.hold ?? holdAll)
      await page.goto(route.path, { waitUntil: 'commit' })
      await expect(route.fallback(page)).toBeVisible()
      summary.push(
        await captureStage(page, route, { name, viewport, reducedMotion }, 'fallback', out),
      )
      worker.release()
      await expect(route.content(page)).toBeVisible()
      await expect(route.fallback(page)).toHaveCount(0)
      summary.push(
        await captureStage(page, route, { name, viewport, reducedMotion }, 'loaded', out),
      )
    }
  await writeFile(resolve(out, 'loading-capture.json'), `${JSON.stringify(summary, null, 2)}\n`)
  return summary
}

/** Shared readiness, screenshot and summary for both transient fallbacks and persistent frames. */
async function captureStage(
  page: Page,
  route: Pick<CaptureRoute, 'name' | 'path'>,
  captureCase: CaptureCase,
  stage: CaptureEntry['stage'],
  out: string,
): Promise<CaptureEntry> {
  await expect
    .poll(() => stylesheetsLoaded(page), { message: 'stylesheets should load' })
    .toBe(true)
  const screenshot = `${route.name}-${stage}-${captureCase.name}.png`
  await page.screenshot({ path: resolve(out, screenshot) })
  return {
    captureCase: captureCase.name,
    route: route.name,
    path: route.path,
    stage,
    viewport: `${captureCase.viewport.width}x${captureCase.viewport.height}`,
    reducedMotion: captureCase.reducedMotion,
    screenshot,
    ...(await measure(page)),
  }
}

/** Capture an already-rendered frame without Worker holds or waiting for its status to disappear. */
export async function captureRendered(
  page: Page,
  route: Pick<CaptureRoute, 'name' | 'path'> & { ready: (page: Page) => Locator },
  out: string,
  captureCase: CaptureCase = captureCases.phone,
) {
  await mkdir(out, { recursive: true })
  await page.setViewportSize(captureCase.viewport)
  await page.emulateMedia({ reducedMotion: captureCase.reducedMotion })
  await page.goto(route.path)
  await expect(route.ready(page)).toBeVisible()
  const entry = await captureStage(page, route, captureCase, 'rendered', out)
  await writeFile(resolve(out, 'frame-capture.json'), `${JSON.stringify(entry, null, 2)}\n`)
  return entry
}
