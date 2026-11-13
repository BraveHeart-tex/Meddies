import type { Locator, Page } from '@playwright/test'
import { expect, test } from './fixtures'
import { waitForClientRouter } from './actions'
import {
  historyDateNav,
  historyFallback,
  historyRouteFallback,
  placeholders,
  rootFallback,
  selectedNavigation,
  settingsRouteFallback,
  signInCard,
  signInRouteFallback,
} from './locators'
import { layoutViewports, shellElements, trackLayout, type Viewport } from './layout'
import { blockPrefetch, expectStreamingOrder } from './streaming'
import { routeRender, type WorkerControls, type WorkerRoute } from './worker-proxy'

// Route fallbacks (#142): each shows before its page resolves, shaped like that page rather
// than Today. These pages have no Worker read ahead of the fallback, so the journeys hold the
// page itself through the route-render seam. No product delay is involved.
const dosesRead: WorkerRoute = { method: 'POST', path: '/schedules', operation: 'listOutcomes' }

test.use({
  journey: { auth: true, storage: true, initialScheduleTime: '2035-06-15T09:00:00+03:00' },
})

type Route = {
  name: string
  url: string
  hold: WorkerRoute
  fallback: (page: Page) => Locator
  content: (page: Page) => Locator
  /** The selected bottom tab; null when the page has none. */
  tab: string | null
  /** False for pages outside the app shell. */
  shell: boolean
}

const settings: Route = {
  name: 'Settings',
  url: '/settings',
  hold: routeRender('settings'),
  fallback: settingsRouteFallback,
  content: (page) => page.getByText('Approved', { exact: true }),
  tab: 'Settings',
  shell: true,
}
const history: Route = {
  name: 'History',
  url: '/history',
  hold: routeRender('history'),
  fallback: historyRouteFallback,
  content: historyDateNav,
  tab: 'History',
  shell: true,
}
const signInError: Route = {
  name: 'sign-in error',
  url: '/sign-in/error?error=AccessDenied',
  hold: routeRender('sign-in-error'),
  fallback: signInRouteFallback,
  content: (page) => page.getByRole('alert').filter({ hasText: "can't open Meddies" }),
  tab: null,
  shell: false,
}

/** The route's own shape and one status, not the Today-shaped cold launch. */
async function expectRouteFallback(page: Page, route: Route) {
  await expect(route.fallback(page)).toBeVisible()
  await expect(rootFallback(page)).toHaveCount(0)
  for (const placeholder of await placeholders(page).all())
    await expect(placeholder).toHaveAttribute('aria-hidden', 'true')
  if (!route.shell) await expect(page.getByRole('navigation', { name: 'Primary' })).toHaveCount(0)
  else if (route.tab) await expect(selectedNavigation(page)).toHaveText(route.tab)
  else await expect(selectedNavigation(page)).toHaveCount(0)
}

/** The fallback shows while the page is held, then content replaces it after release. */
function expectOrder(page: Page, worker: WorkerControls, route: Route) {
  return expectStreamingOrder(worker, {
    routes: [route.hold],
    fallback: route.fallback(page),
    content: route.content(page),
  })
}

// Allowed reason: streaming during a cold client navigation.
test('cold client navigation shows the History fallback before the page', async ({ page, app }) => {
  const prefetch = await blockPrefetch(page, history.url)
  await page.goto('/')
  await waitForClientRouter(page)
  await prefetch.expectBlocked()
  app.worker.hold(history.hold)
  await page.getByRole('navigation', { name: 'Primary' }).getByText('History').click()
  await expectRouteFallback(page, history)
  await expect(page.getByRole('status')).toHaveCount(1)
  await expectOrder(page, app.worker, history)
})

// Direct-load layout shift budget for the routes below: a fallback is replaced, not moved, and
// its shell is the page's own, so any shift is a regression. The allowance absorbs sub-pixel
// font metrics only, as in Today's and History's budgets.
const layoutShiftBudget = 0.01

async function expectStableLayout(
  page: Page,
  viewport: Viewport,
  result: Awaited<ReturnType<Awaited<ReturnType<typeof trackLayout>>['result']>>,
) {
  const [fallback, loaded] = result.snapshots
  expect(loaded.boxes, `${viewport.width}px: shell boxes`).toEqual(fallback.boxes)
  expect(result.cumulativeLayoutShift, `${viewport.width}px: layout shift`).toBeLessThanOrEqual(
    layoutShiftBudget,
  )
}

// Allowed reason: server-to-browser streaming, once per distinct route fallback.
{
  const viewport = layoutViewports.phone
  const name = '402px'

  test(`Settings keeps its shell and cards in place at ${name}`, async ({ page, app }) => {
    const layout = await trackLayout(page, viewport)
    const elements = () => ({
      ...shellElements(page),
      account: page.getByRole('heading', { name: 'Account' }),
      time: page.getByRole('heading', { name: 'Time' }),
    })
    app.worker.hold(settings.hold)
    await page.goto(settings.url, { waitUntil: 'commit' })
    await expectRouteFallback(page, settings)
    await expect(page.getByRole('status')).toHaveCount(1)
    await layout.snapshot('fallback', elements())
    await expectOrder(page, app.worker, settings)
    await layout.snapshot('loaded', elements())
    await expectStableLayout(page, viewport, await layout.result())
  })

  test(`History keeps its shell and results in place at ${name}`, async ({ page, app }) => {
    const layout = await trackLayout(page, viewport)
    // The last row closes both fallbacks, so its box shows whether the date bar above held.
    const elements = () => ({ ...shellElements(page), lastRow: placeholders(page).last() })
    app.worker.hold(history.hold)
    app.worker.hold(dosesRead)
    await page.goto(history.url, { waitUntil: 'commit' })
    await expectRouteFallback(page, history)
    await expect(page.getByRole('status')).toHaveCount(1)
    await layout.snapshot('fallback', elements())
    await expectOrder(page, app.worker, history)
    await expect(historyFallback(page)).toBeVisible()
    await layout.snapshot('loaded', elements())
    await expectStableLayout(page, viewport, await layout.result())
    app.worker.release(dosesRead)
  })

  test(`sign-in error keeps its card in place at ${name}`, async ({ page, app }) => {
    const layout = await trackLayout(page, viewport)
    const elements = () => ({
      wordmark: page.getByText('Meddies', { exact: true }),
      card: signInCard(page),
    })
    app.worker.hold(signInError.hold)
    await page.goto(signInError.url, { waitUntil: 'commit' })
    await expectRouteFallback(page, signInError)
    await expect(page.getByRole('status')).toHaveCount(1)
    await layout.snapshot('fallback', elements())
    await expectOrder(page, app.worker, signInError)
    await layout.snapshot('loaded', elements())
    await expectStableLayout(page, viewport, await layout.result())
  })
}
