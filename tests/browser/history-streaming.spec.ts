import type { Page } from '@playwright/test'
import { expect, test } from './fixtures'
import {
  doseRow,
  historyDateNav as dateNav,
  historyFallback as fallback,
  historyList,
  historyFallbackSection,
  placeholders,
  rootFallback,
} from './locators'
import { layoutViewports, trackLayout } from './layout'
import { countApiRequests, type ApiRequestCounter } from './requests'
import { addDays, insertScheduledMedicine } from './seed'
import { blockPrefetch, expectReadsOverlap, expectStreamingOrder } from './streaming'
import type { WorkerRoute } from './worker-proxy'

// History streams one date's results (FE-679): the shell, heading and date bar render first, the
// 648·H4 fallback holds the results while the server reads, and the browser reuses the hydrated
// data. Later date changes read that date in the browser.
const initialScheduleTime = '2035-06-15T09:00:00+03:00'
const today = initialScheduleTime.slice(0, 10)
const yesterday = addDays(today, -1)

const dosesRead: WorkerRoute = { method: 'POST', path: '/schedules', operation: 'listOutcomes' }
const historyReads: WorkerRoute[] = [
  dosesRead,
  { method: 'POST', path: '/medicines', operation: 'list' },
]

// Direct-load layout shift budget at 402px, Today's FE-672 budget. The fallback is
// replaced, not moved, and the shell and date bar above it do not change size, so any shift is a
// regression. The small allowance absorbs sub-pixel font metrics only.
const layoutShiftBudget = 0.01

test.use({
  journey: {
    auth: true,
    storage: true,
    initialScheduleTime,
    seed: ({ db, ownerId }) =>
      insertScheduledMedicine(db, ownerId, {
        label: 'Streaming Fixture Medicine',
        startDate: addDays(today, -3),
        times: [{ time: '08:00', quantity: 1 }],
      }),
  },
})

const doses = (page: Page, date = today) => historyList(page, date)

// History renders hydrated server data, so the browser must not read it again after load.
function expectNoRepeatedReads(api: ApiRequestCounter) {
  expect(api.count('/api/schedules/history'), '/api/schedules/history reads').toBe(0)
  expect(api.count('/api/schedules'), '/api/schedules reads').toBe(0)
  expect(api.count('/api/medicines'), '/api/medicines reads').toBe(0)
}

/** The shell and date bar are real and the results hold their place with one status. */
async function expectShellWithFallback(page: Page) {
  await expect(page.getByRole('heading', { level: 1, name: 'History' })).toBeVisible()
  await expect(dateNav(page).getByRole('button', { name: 'Previous day' })).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Primary' })).toBeVisible()
  await expect(fallback(page)).toBeVisible()
  await expect(rootFallback(page)).toHaveCount(0)
  await expect(page.getByRole('status')).toHaveCount(1)
  await expect(placeholders(page)).toHaveCount(4)
  for (const placeholder of await placeholders(page).all())
    await expect(placeholder).toHaveAttribute('aria-hidden', 'true')
}

test('direct load streams the shell, fallback and results in a stable layout', async ({
  page,
  app,
}) => {
  const api = countApiRequests(page, app.origin)
  const layout = await trackLayout(page, layoutViewports.phone)
  for (const route of historyReads) app.worker.hold(route)
  await page.goto('/history', { waitUntil: 'commit' })
  await expectReadsOverlap(app.worker, historyReads)
  await expectShellWithFallback(page)
  await expect(page.getByText('Nothing to show for that day.')).toHaveCount(0)
  await layout.snapshot('fallback')
  await expectStreamingOrder(app.worker, {
    routes: historyReads,
    fallback: fallback(page),
    content: doses(page),
  })
  await expect(doses(page)).toContainText('Streaming Fixture Medicine')
  await page.waitForLoadState('load')
  expectNoRepeatedReads(api)
  await layout.snapshot('loaded')
  const result = await layout.result()
  const [fallbackBoxes, loadedBoxes] = result.snapshots.map((snapshot) => snapshot.boxes)
  expect(loadedBoxes, 'the shell keeps its geometry').toEqual(fallbackBoxes)
  expect(result.cumulativeLayoutShift).toBeLessThanOrEqual(layoutShiftBudget)
})

test('cold client navigation shows the same fallback before History', async ({ page, app }) => {
  const prefetch = await blockPrefetch(page, '/history')
  const api = countApiRequests(page, app.origin)
  await page.goto('/')
  await expect(doseRow(page, `${today}T05:00:00.000Z`)).toBeVisible()
  await page.waitForLoadState('load')
  for (const route of historyReads) app.worker.hold(route)
  api.reset()
  await prefetch.expectBlocked()
  await page
    .getByRole('navigation', { name: 'Primary' })
    .getByRole('link', { name: 'History' })
    .click()
  await expectReadsOverlap(app.worker, historyReads)
  await expectShellWithFallback(page)
  await expectStreamingOrder(app.worker, {
    routes: historyReads,
    fallback: fallback(page),
    content: doses(page),
  })
  await expect(page).toHaveURL(/\/history$/)
  await expect(doses(page)).toContainText('Streaming Fixture Medicine')
  expectNoRepeatedReads(api)
})

test('an uncached date shows the fallback, then a visited date shows at once', async ({
  page,
  app,
}) => {
  const api = countApiRequests(page, app.origin)
  await page.goto('/history')
  await expect(doses(page)).toContainText('Streaming Fixture Medicine')
  await page.waitForLoadState('load')
  expectNoRepeatedReads(api)

  // Previous day reads that date in the browser, through the Worker, with no page load.
  app.worker.hold(dosesRead)
  await dateNav(page).getByRole('button', { name: 'Previous day' }).click()
  await expect(page).toHaveURL(`/history?date=${yesterday}`)
  await expect(fallback(page)).toBeVisible()
  await expect(page.getByRole('status')).toHaveCount(1)
  await expect(page.getByRole('heading', { level: 1, name: 'History' })).toBeVisible()
  app.worker.release(dosesRead)
  await expect(doses(page, yesterday)).toContainText('Streaming Fixture Medicine')
  expect(api.count('/api/schedules/history')).toBe(1)

  // Back to today: cached, so its doses show at once while the held refresh runs.
  app.worker.hold(dosesRead)
  await dateNav(page).getByRole('button', { name: 'Next day' }).click()
  await expect(page).toHaveURL(`/history?date=${today}`)
  await expect(doses(page)).toContainText('Streaming Fixture Medicine')
  await expect(fallback(page)).toHaveCount(0)
  await expect.poll(() => app.worker.held(dosesRead)).toBe(1)
  app.worker.release(dosesRead)
  await expect.poll(() => api.count('/api/schedules/history')).toBe(2)

  // Back and reload keep working from the URL.
  await page.goBack()
  await expect(page).toHaveURL(`/history?date=${yesterday}`)
  await expect(doses(page, yesterday)).toBeVisible()
  await page.reload()
  await expect(doses(page, yesterday)).toContainText('Streaming Fixture Medicine')
})

test('failed History reads show the unavailable state, and Retry recovers', async ({
  page,
  app,
}) => {
  for (const route of historyReads) app.worker.fail(route, 503)
  await page.goto('/history')
  await expect(
    page
      .getByRole('alert')
      .filter({ hasText: "History for Today, Fri 15 Jun didn't load just now." }),
  ).toBeVisible()
  await expect(page.getByRole('heading', { level: 1, name: 'History' })).toBeVisible()
  app.worker.clear()
  const api = countApiRequests(page, app.origin)
  await page.getByRole('button', { name: 'Try this date again' }).click()
  await expect(doses(page)).toContainText('Streaming Fixture Medicine')
  // Retry refetched in place; the page did not load again.
  expect(api.count('/api/schedules/history')).toBe(1)
})

// A future date is well formed, so only the page's own date check turns it away.
test('invalid entry keeps its notice and day in place', async ({ page, app }, testInfo) => {
  for (const route of historyReads) app.worker.hold(route)
  await page.goto('/history?date=2035-12-24', { waitUntil: 'commit' })
  await expectReadsOverlap(app.worker, historyReads)
  await expectShellWithFallback(page)
  const notice = page.getByRole('alert').filter({ hasText: 'Nothing to show for that day.' })
  await expect(notice).toBeVisible()
  const noticeBefore = await notice.boundingBox()
  const dayBefore = await historyFallbackSection(page).boundingBox()
  await page.screenshot({ path: testInfo.outputPath('invalid-loading.png') })
  for (const route of historyReads) app.worker.release(route)
  await expect(doses(page)).toContainText('Streaming Fixture Medicine')
  await expect(page).toHaveURL(`/history?date=${today}`)
  await expect(notice).toHaveCount(1)
  await expect(page.getByRole('status')).toHaveCount(0)
  const dayAfter = await page.getByRole('region', { name: 'Friday, 15 June, 1 dose' }).boundingBox()
  expect(await notice.boundingBox(), 'notice retains its final geometry').toEqual(noticeBefore)
  expect(dayAfter!.y, 'the day starts at the same position after streaming').toBe(dayBefore!.y)
  await page.screenshot({ path: testInfo.outputPath('invalid-loaded.png') })
})
