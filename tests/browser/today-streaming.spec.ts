import type { Page } from '@playwright/test'
import { waitForClientRouter } from './actions'
import { expect, test } from './fixtures'
import {
  historyList,
  placeholders,
  rootFallback,
  todayFallback as fallback,
  todaysDoses,
} from './locators'
import { layoutViewports, trackLayout } from './layout'
import { countApiRequests, type ApiRequestCounter } from './requests'
import { addDays, insertScheduledMedicine } from './seed'
import { blockPrefetch, expectReadsOverlap, expectStreamingOrder } from './streaming'
import type { WorkerRoute } from './worker-proxy'

// Today streams its doses section (FE-672): the shell and header render first, the 648·T1
// fallback holds the section while the server reads, and the browser reuses the hydrated data.
const initialScheduleTime = '2035-06-15T09:00:00+03:00'
const today = initialScheduleTime.slice(0, 10)

const todayReads: WorkerRoute[] = [
  { method: 'POST', path: '/schedules', operation: 'listOutcomes' },
  { method: 'POST', path: '/medicines', operation: 'list' },
]

// Direct-load layout shift budget at 320px and 402px; measured 0 at both (FE-672). The fallback
// is replaced, not moved, and nothing above it changes size, so any shift is a regression. The
// small allowance absorbs sub-pixel font metrics only.
const layoutShiftBudget = 0.01

test.use({
  journey: {
    auth: true,
    storage: true,
    initialScheduleTime,
    seed: ({ db, ownerId }) =>
      insertScheduledMedicine(db, ownerId, {
        label: 'Streaming Fixture Medicine',
        startDate: addDays(today, -1),
        times: [
          { time: '08:00', quantity: 1 },
          { time: '13:00', quantity: 1 },
          { time: '20:00', quantity: 1 },
        ],
      }),
  },
})

const greeting = (page: Page) => page.getByRole('heading', { level: 1, name: 'Good morning' })

// Today renders hydrated server data, so the browser must not read it again after load.
function expectNoRepeatedReads(api: ApiRequestCounter) {
  expect(api.count('/api/schedules'), '/api/schedules reads after load').toBe(0)
  expect(api.count('/api/medicines'), '/api/medicines reads after load').toBe(0)
}

/** The shell is real and the doses section holds its place with one status. */
async function expectShellWithFallback(page: Page) {
  await expect(greeting(page)).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Primary' })).toBeVisible()
  await expect(fallback(page)).toBeVisible()
  await expect(rootFallback(page)).toHaveCount(0)
  await expect(page.getByRole('status')).toHaveCount(1)
  await expect(placeholders(page)).toHaveCount(5)
  for (const placeholder of await placeholders(page).all())
    await expect(placeholder).toHaveAttribute('aria-hidden', 'true')
}

test('direct load shows the shell and doses fallback while Today reads are held', async ({
  page,
  app,
}) => {
  const api = countApiRequests(page, app.origin)
  for (const route of todayReads) app.worker.hold(route)
  await page.goto('/', { waitUntil: 'commit' })
  await expectReadsOverlap(app.worker, todayReads)
  await expectShellWithFallback(page)
  await expectStreamingOrder(app.worker, {
    routes: todayReads,
    fallback: fallback(page),
    content: todaysDoses(page),
  })
  await expect(todaysDoses(page)).toContainText('Streaming Fixture Medicine')
  await page.waitForLoadState('load')
  expectNoRepeatedReads(api)
})

test('cold client navigation shows the same fallback before Today', async ({ page, app }) => {
  const prefetch = await blockPrefetch(page, '/')
  const api = countApiRequests(page, app.origin)
  await page.goto('/history')
  await expect(historyList(page, today)).toBeVisible()
  await page.waitForLoadState('load')
  for (const route of todayReads) app.worker.hold(route)
  api.reset()
  await prefetch.expectBlocked()
  await page
    .getByRole('navigation', { name: 'Primary' })
    .getByRole('link', { name: 'Today' })
    .click()
  await expectReadsOverlap(app.worker, todayReads)
  await expectShellWithFallback(page)
  await expectStreamingOrder(app.worker, {
    routes: todayReads,
    fallback: fallback(page),
    content: todaysDoses(page),
  })
  await expect(page).toHaveURL(/\/$/)
  await expect(todaysDoses(page)).toContainText('Streaming Fixture Medicine')
  expectNoRepeatedReads(api)
})

test('warm client navigation shows cached doses instead of the skeleton', async ({ page, app }) => {
  // No prefetched page may stand in for the server read held below.
  await blockPrefetch(page, '/')
  await page.goto('/')
  await waitForClientRouter(page)
  await expect(todaysDoses(page)).toContainText('Streaming Fixture Medicine')
  const nav = page.getByRole('navigation', { name: 'Primary' })
  await nav.getByRole('link', { name: 'History' }).click()
  await expect(historyList(page, today)).toBeVisible()
  for (const route of todayReads) app.worker.hold(route)
  await nav.getByRole('link', { name: 'Today' }).click()
  await expectReadsOverlap(app.worker, todayReads)
  // The session cache already holds Today, so no skeleton replaces usable data (DESIGN.md).
  await expect(todaysDoses(page)).toContainText('Streaming Fixture Medicine')
  await expect(fallback(page)).toHaveCount(0)
  await expect(placeholders(page)).toHaveCount(0)
  for (const route of todayReads) app.worker.release(route)
  await expect(todaysDoses(page)).toContainText('Streaming Fixture Medicine')
})

for (const [name, viewport] of Object.entries(layoutViewports))
  test(`keeps Today layout shift within budget on direct load at ${viewport.width}px`, async ({
    page,
    app,
  }, testInfo) => {
    const layout = await trackLayout(page, viewport)
    for (const route of todayReads) app.worker.hold(route)
    await page.goto('/', { waitUntil: 'commit' })
    await expect(fallback(page)).toBeVisible()
    await layout.snapshot('fallback')
    for (const route of todayReads) app.worker.release(route)
    await expect(todaysDoses(page)).toBeVisible()
    await page.waitForLoadState('load')
    await layout.snapshot('loaded')
    const result = await layout.result()
    await testInfo.attach(`layout-${name}.json`, {
      body: JSON.stringify(result, null, 2),
      contentType: 'application/json',
    })
    console.log(`Today layout ${viewport.width}px: ${JSON.stringify(result)}`)
    const [fallbackBoxes, loadedBoxes] = result.snapshots.map((snapshot) => snapshot.boxes)
    expect(loadedBoxes, 'the shell keeps its geometry').toEqual(fallbackBoxes)
    expect(result.cumulativeLayoutShift).toBeLessThanOrEqual(layoutShiftBudget)
  })

test('failed Today reads show recoverable errors in the shell', async ({ page, app }) => {
  for (const route of todayReads) app.worker.fail(route, 503)
  await page.goto('/')
  await expect(greeting(page)).toBeVisible()
  await expect(page.getByText(/Your medications didn't load just now/)).toBeVisible()
  await expect(
    page.getByText("Today didn't update just now. Check your connection and try again."),
  ).toBeVisible()
  app.worker.clear()
  await page.getByRole('button', { name: 'Try loading medications again' }).click()
  await page.getByRole('button', { name: 'Try again' }).click()
  await expect(todaysDoses(page)).toContainText('Streaming Fixture Medicine')
})

test.describe('with no medicines', () => {
  test.use({ journey: { auth: true, storage: true, initialScheduleTime } })

  test('streams the empty state', async ({ page, app }) => {
    const api = countApiRequests(page, app.origin)
    await page.goto('/')
    await expect(page.getByText("Nothing to take today. You're all set.")).toBeVisible()
    await page.waitForLoadState('load')
    expectNoRepeatedReads(api)
  })
})
