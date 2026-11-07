import type { Locator, Page } from '@playwright/test'
import { expect } from './fixtures'
import { overlapped, type WorkerControls, type WorkerRoute } from './worker-proxy'

// Loading-path helpers for route journeys. Hold the route's Worker reads with `app.worker.hold`
// first, then start the navigation without waiting for `load`: a held stream never finishes.

const routeName = (route: WorkerRoute) =>
  `${route.method} ${route.path}${route.operation ? ` ${route.operation}` : ''}`

/**
 * Independent reads overlap: each route has a held request, so all started before any was
 * released. A page that awaited one read before starting the next times out here.
 */
async function expectHeld(worker: WorkerControls, routes: WorkerRoute[]) {
  for (const route of routes)
    await expect
      .poll(() => worker.held(route), { message: `${routeName(route)} should be held` })
      .toBeGreaterThan(0)
}

export async function expectReadsOverlap(worker: WorkerControls, routes: WorkerRoute[]) {
  await expectHeld(worker, routes)
  const reads = routes.map((route) => worker.requests(route).findLast((read) => !read.end)!)
  expect(overlapped(reads), `${routes.map(routeName).join(' and ')} should overlap`).toBe(true)
}

/**
 * A real stream: `fallback` is visible while a matching Worker request is still held, and
 * `content` replaces it after the routes are released.
 */
export async function expectStreamingOrder(
  worker: WorkerControls,
  { routes, fallback, content }: { routes: WorkerRoute[]; fallback: Locator; content: Locator },
) {
  await expectHeld(worker, routes)
  await expect(fallback).toBeVisible()
  await expect(content).toHaveCount(0)
  // The fallback was visible before this check, so it showed while the read was held.
  const stillHeld = routes.some((route) => worker.held(route) > 0)
  expect(stillHeld, 'fallback should show while a Worker read is held').toBe(true)
  for (const route of routes) worker.release(route)
  await expect(content).toBeVisible()
  await expect(fallback).toHaveCount(0)
}

/**
 * Abort router prefetches (`Next-Router-Prefetch`) for `path`, so a client navigation there
 * is cold and cannot reuse a prefetched loading state or page. Install before the page that
 * links to `path` loads, then call `expectBlocked` before following the link. Next.js does not
 * prefetch under `next dev`, so this needs the production build.
 */
export async function blockPrefetch(page: Page, path: string) {
  let blocked = 0
  await page.route(
    (url) => url.pathname === path,
    async (route) => {
      if (!(await route.request().headerValue('next-router-prefetch'))) return route.fallback()
      blocked++
      await route.abort()
    },
  )
  return {
    expectBlocked: () =>
      expect
        .poll(() => blocked, { message: `a prefetch of ${path} should be blocked` })
        .toBeGreaterThan(0),
  }
}
