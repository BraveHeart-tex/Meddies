import type { Page } from '@playwright/test'
import { expect, test } from './fixtures'
import { doseRow, historyList, placeholders } from './locators'
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

const fallback = (page: Page) => page.getByRole('status').filter({ hasText: 'Opening Meddies' })
const doses = (page: Page) => historyList(page, today)

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
})

test('cold client navigation shows the same fallback before History', async ({ page, app }) => {
  const prefetch = await blockPrefetch(page, '/history')
  await page.goto('/')
  await expect(doseRow(page, `${today}T05:00:00.000Z`)).toBeVisible()
  for (const route of historyReads) app.worker.hold(route)
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
})

test('failed History reads show the unavailable state', async ({ page, app }) => {
  for (const route of historyReads) app.worker.fail(route, 503)
  await page.goto('/history')
  await expect(
    page.getByRole('alert').filter({ hasText: 'Dose history is temporarily unavailable.' }),
  ).toBeVisible()
  await expect(page.getByRole('link', { name: 'Retry this date' })).toBeVisible()
})
