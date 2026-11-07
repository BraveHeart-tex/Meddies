import type { Page } from '@playwright/test'
import { expect, test } from './fixtures'
import { doseRow, historyList, placeholders, rootFallback as fallback } from './locators'
import { layoutViewports, trackLayout } from './layout'
import { countApiRequests, type ApiRequestCounter } from './requests'
import { addDays, insertScheduledMedicine } from './seed'
import { blockPrefetch, expectReadsOverlap, expectStreamingOrder } from './streaming'
import type { WorkerRoute } from './worker-proxy'

// Smoke test for the Worker controls: History has no boundary of its own, so the root loading
// fallback (649·L1) streams while its server reads are held.
const initialScheduleTime = '2035-06-15T09:00:00+03:00'
const today = initialScheduleTime.slice(0, 10)

const historyReads: WorkerRoute[] = [
  { method: 'POST', path: '/schedules', operation: 'listOutcomes' },
  { method: 'POST', path: '/medicines', operation: 'list' },
]

test.use({
  journey: {
    auth: true,
    storage: true,
    initialScheduleTime,
    seed: ({ db, ownerId }) =>
      insertScheduledMedicine(db, ownerId, {
        label: 'Streaming Fixture Medicine',
        startDate: addDays(today, -1),
        times: [{ time: '08:00', quantity: 1 }],
      }),
  },
})

const doses = (page: Page) => historyList(page, today)

// History renders server data only, so the browser must not read it again after load.
function expectNoRepeatedReads(api: ApiRequestCounter) {
  expect(api.count('/api/schedules'), '/api/schedules reads after load').toBe(0)
  expect(api.count('/api/medicines'), '/api/medicines reads after load').toBe(0)
}

async function expectAccessibleFallback(page: Page) {
  await expect(fallback(page)).toBeVisible()
  await expect(page.getByRole('status')).toHaveCount(1)
  await expect(placeholders(page)).not.toHaveCount(0)
  for (const placeholder of await placeholders(page).all())
    await expect(placeholder).toHaveAttribute('aria-hidden', 'true')
}

test('direct load streams the root fallback while History reads are held', async ({
  page,
  app,
}) => {
  const api = countApiRequests(page, app.origin)
  for (const route of historyReads) app.worker.hold(route)
  await page.goto('/history', { waitUntil: 'commit' })
  await expectReadsOverlap(app.worker, historyReads)
  await expectAccessibleFallback(page)
  await expectStreamingOrder(app.worker, {
    routes: historyReads,
    fallback: fallback(page),
    content: doses(page),
  })
  await expect(doses(page)).toContainText('Streaming Fixture Medicine')
  await page.waitForLoadState('load')
  expectNoRepeatedReads(api)
})

test('cold client navigation shows the same fallback before History', async ({ page, app }) => {
  const prefetch = await blockPrefetch(page, '/history')
  const api = countApiRequests(page, app.origin)
  await page.goto('/')
  await expect(doseRow(page, `${today}T05:00:00.000Z`)).toBeVisible()
  for (const route of historyReads) app.worker.hold(route)
  api.reset()
  await prefetch.expectBlocked()
  await page
    .getByRole('navigation', { name: 'Primary' })
    .getByRole('link', { name: 'History' })
    .click()
  await expectReadsOverlap(app.worker, historyReads)
  await expectAccessibleFallback(page)
  await expectStreamingOrder(app.worker, {
    routes: historyReads,
    fallback: fallback(page),
    content: doses(page),
  })
  await expect(page).toHaveURL(/\/history$/)
  await expect(doses(page)).toContainText('Streaming Fixture Medicine')
  expectNoRepeatedReads(api)
})

// Evidence only, no budget: the root fallback is Today-shaped, and History's own fallback is
// FE-679's. The result is logged for the issue and attached to the test.
for (const [name, viewport] of Object.entries(layoutViewports))
  test(`records History layout shift on direct load at ${viewport.width}px`, async ({
    page,
    app,
  }, testInfo) => {
    const layout = await trackLayout(page, viewport)
    for (const route of historyReads) app.worker.hold(route)
    await page.goto('/history', { waitUntil: 'commit' })
    await expectAccessibleFallback(page)
    await layout.snapshot('fallback')
    for (const route of historyReads) app.worker.release(route)
    await expect(doses(page)).toBeVisible()
    await page.waitForLoadState('load')
    await layout.snapshot('loaded')
    const result = await layout.result()
    await testInfo.attach(`layout-${name}.json`, {
      body: JSON.stringify(result, null, 2),
      contentType: 'application/json',
    })
    console.log(`History layout ${viewport.width}px: ${JSON.stringify(result)}`)
    expect(result.snapshots.map((snapshot) => snapshot.boxes.primaryNav)).not.toContain(null)
  })

test('failed History reads show the unavailable state', async ({ page, app }) => {
  for (const route of historyReads) app.worker.fail(route, 503)
  await page.goto('/history')
  await expect(
    page
      .getByRole('alert')
      .filter({ hasText: 'History for Today, Fri 15 Jun could not be loaded.' }),
  ).toBeVisible()
  await expect(page.getByRole('link', { name: 'Retry this date' })).toBeVisible()
})
