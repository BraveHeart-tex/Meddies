import { randomUUID } from 'node:crypto'
import type { Page } from '@playwright/test'
import { expect, test, type JourneyDatabase } from './fixtures'
import { layoutViewports, trackLayout } from './layout'
import {
  drawer,
  medicationFallback,
  medicationSetupFallback,
  medicationsFallback as fallback,
  medicationsFallbackSection,
  medicationsList as list,
  placeholders,
  rootFallback,
} from './locators'
import { countApiRequests, type ApiRequestCounter } from './requests'
import { addDays, insertScheduledMedicine } from './seed'
import { blockPrefetch, expectReadsOverlap, expectStreamingOrder } from './streaming'
import type { WorkerRoute } from './worker-proxy'

// Medications streams one section for its data views (#87): the shell, title and Add render
// first, the list skeleton holds the list while the server reads, the browser reuses the hydrated data, and
// view changes use the native History API. #88 adds the medication page and schedule setup,
// whose direct links hold the medication page skeleton and its setup equivalent.
const initialScheduleTime = '2035-06-15T09:00:00+03:00'
const today = initialScheduleTime.slice(0, 10)

const reads: WorkerRoute[] = [
  { method: 'POST', path: '/schedules', operation: 'listOutcomes' },
  { method: 'POST', path: '/medicines', operation: 'list' },
]

// Direct-load layout shift budget, as Today and History: the skeleton is replaced, not moved, and
// the header above it reserves the count's line, so any shift is a regression. The allowance
// absorbs sub-pixel font metrics only.
const layoutShiftBudget = 0.01

const scheduled = 'Streaming Scheduled Medicine'
const unscheduled = 'Streaming Unscheduled Medicine'

function insertMedicine(
  db: JourneyDatabase,
  ownerId: string,
  label: string,
  id: string = randomUUID(),
) {
  return db
    .prepare('INSERT INTO user_medications(owner_id,id,label,strength,unit) VALUES(?,?,?,?,?)')
    .bind(ownerId, id, label, '10 mg', 'tablet')
    .run()
}

const seedTwo = async ({ db, ownerId }: { db: JourneyDatabase; ownerId: string }) => {
  await insertScheduledMedicine(db, ownerId, {
    label: scheduled,
    startDate: addDays(today, -3),
    times: [{ time: '08:00', quantity: 1 }],
  })
  await insertMedicine(db, ownerId, unscheduled)
}

test.use({ journey: { auth: true, storage: true, initialScheduleTime, seed: seedTwo } })

const title = (page: Page) => page.getByRole('heading', { level: 1, name: 'Medications' })
const add = (page: Page) => page.getByRole('link', { name: 'Add a medication' })
const row = (page: Page, label: string) =>
  page.getByRole('link', { name: `View details for ${label}` })

function expectNoRepeatedReads(api: ApiRequestCounter) {
  expect(api.count('/api/medicines'), '/api/medicines reads').toBe(0)
  expect(api.count('/api/schedules'), '/api/schedules reads').toBe(0)
}

/** Server round trips for the page itself: documents and RSC payloads. */
function countPageRequests(page: Page) {
  let count = 0
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === '/medications') count++
  })
  return { count: () => count, reset: () => (count = 0) }
}

async function expectShellWithFallback(page: Page) {
  await expect(title(page)).toBeVisible()
  await expect(add(page)).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Primary' })).toBeVisible()
  await expect(fallback(page)).toBeVisible()
  await expect(rootFallback(page)).toHaveCount(0)
  await expect(page.getByRole('status')).toHaveCount(1)
  await expect(placeholders(page)).toHaveCount(4)
  for (const placeholder of await placeholders(page).all())
    await expect(placeholder).toHaveAttribute('aria-hidden', 'true')
  await expect(page.getByText(/^\d+ medications?$/)).toHaveCount(0)
}

test('direct load streams the shell, fallback and list in a stable layout', async ({
  page,
  app,
}) => {
  const api = countApiRequests(page, app.origin)
  const layout = await trackLayout(page, layoutViewports.phone)
  for (const route of reads) app.worker.hold(route)
  await page.goto('/medications', { waitUntil: 'commit' })
  await expectReadsOverlap(app.worker, reads)
  await expectShellWithFallback(page)
  // EntryFocus mounts with the page, so the route's loading fallback has been replaced.
  await expect(title(page)).toBeFocused()
  await layout.snapshot('fallback')
  const before = await medicationsFallbackSection(page).boundingBox()
  await expectStreamingOrder(app.worker, {
    routes: reads,
    fallback: fallback(page),
    content: list(page),
  })
  await expect(row(page, scheduled)).toBeVisible()
  await expect(list(page).getByText('On a schedule', { exact: true }).first()).toBeVisible()
  await expect(page.getByText('2 medications')).toBeVisible()
  await page.waitForLoadState('load')
  expectNoRepeatedReads(api)
  await layout.snapshot('loaded')
  const after = await list(page).boundingBox()
  const result = await layout.result()
  const [fallbackBoxes, loadedBoxes] = result.snapshots.map((snapshot) => snapshot.boxes)
  expect(loadedBoxes, 'the shell keeps its geometry').toEqual(fallbackBoxes)
  expect(after!.y, 'the list starts where the fallback did').toBe(before!.y)
  expect(result.cumulativeLayoutShift).toBeLessThanOrEqual(layoutShiftBudget)
})

test('cold client navigation shows the same fallback before the list', async ({ page, app }) => {
  const prefetch = await blockPrefetch(page, '/medications')
  const api = countApiRequests(page, app.origin)
  await page.goto('/settings')
  await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible()
  await page.waitForLoadState('load')
  await prefetch.expectBlocked()
  for (const route of reads) app.worker.hold(route)
  api.reset()
  await page
    .getByRole('navigation', { name: 'Primary' })
    .getByRole('link', { name: 'Medications' })
    .click()
  await expectReadsOverlap(app.worker, reads)
  await expectShellWithFallback(page)
  await expectStreamingOrder(app.worker, {
    routes: reads,
    fallback: fallback(page),
    content: list(page),
  })
  await expect(page).toHaveURL(/\/medications$/)
  await expect(row(page, scheduled)).toBeVisible()
  expectNoRepeatedReads(api)
})

test('a warm navigation keeps the cached list on screen instead of the skeleton', async ({
  page,
  app,
}) => {
  await page.goto('/medications')
  await expect(row(page, scheduled)).toBeVisible()
  await page.waitForLoadState('load')
  await page.getByRole('link', { name: 'Settings' }).click()
  await expect(page).toHaveURL(`${app.origin}/settings`)
  for (const route of reads) app.worker.hold(route)
  await page
    .getByRole('navigation', { name: 'Primary' })
    .getByRole('link', { name: 'Medications' })
    .click()
  await expect(page).toHaveURL(`${app.origin}/medications`)
  await expect(row(page, scheduled)).toBeVisible()
  await expect(fallback(page)).toHaveCount(0)
  await expect(placeholders(page)).toHaveCount(0)
  // A row opened from the cached list still lands on its medicine when the page arrives.
  await row(page, unscheduled).click()
  await expect(page).toHaveURL(/\/medications\?medicine=/)
  for (const route of reads) app.worker.release(route)
  await expect(page.getByRole('heading', { name: unscheduled })).toBeVisible()
  await expect(page).toHaveURL(/\/medications\?medicine=/)
})

test('view changes make no server request, and Back, Forward and reload restore the view', async ({
  page,
  app,
}) => {
  const api = countApiRequests(page, app.origin)
  const pageRequests = countPageRequests(page)
  await page.goto('/medications')
  await expect(row(page, unscheduled)).toBeVisible()
  await page.waitForLoadState('load')
  expectNoRepeatedReads(api)
  pageRequests.reset()

  await row(page, unscheduled).click()
  await expect(page).toHaveURL(/\/medications\?medicine=/)
  await expect(page.getByRole('heading', { name: unscheduled })).toBeVisible()

  await page.goBack()
  await expect(page).toHaveURL(/\/medications$/)
  await expect(row(page, unscheduled)).toBeVisible()

  await add(page).click()
  await expect(page).toHaveURL(/\/medications\?add$/)
  await expect(drawer(page).getByRole('heading', { name: 'Add medication' })).toBeVisible()
  await page.goBack()
  await expect(row(page, unscheduled)).toBeVisible()

  await page.getByRole('link', { name: `Set schedule for ${unscheduled}` }).click()
  await expect(page).toHaveURL(/\/medications\?schedule=.*#schedule-heading$/)
  await expect(page.getByRole('heading', { name: 'Schedule' }).first()).toBeVisible()

  await page.goBack()
  await page.goForward()
  await expect(page).toHaveURL(/\/medications\?schedule=/)

  // 212·C0: Cancel with no edits leaves for the medication's page in place of setup.
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(page).toHaveURL(/\/medications\?medicine=/)
  await expect(page.getByRole('heading', { level: 1, name: unscheduled })).toBeVisible()
  await page.getByRole('link', { name: 'Set schedule', exact: true }).click()
  await expect(page).toHaveURL(/\/medications\?schedule=/)
  await expect(page.getByRole('heading', { level: 1, name: unscheduled })).toBeVisible()
  expect(pageRequests.count(), 'page requests during view changes').toBe(0)
  expectNoRepeatedReads(api)

  await page.reload()
  await expect(page).toHaveURL(/\/medications\?schedule=/)
  await expect(page.getByRole('heading', { name: 'Schedule' }).first()).toBeVisible()
})

test('Add never waits for the reads', async ({ page, app }) => {
  for (const route of reads) app.worker.hold(route)
  await page.goto('/medications?add', { waitUntil: 'commit' })
  await expect(drawer(page).getByRole('heading', { name: 'Add medication' })).toBeVisible()
  await expect(page.getByRole('textbox').first()).toBeVisible()
  for (const route of reads) app.worker.release(route)
})

test('failed reads show one alert with Retry and Add, and Retry recovers', async ({
  page,
  app,
}) => {
  for (const route of reads) app.worker.fail(route, 503)
  await page.goto('/medications')
  await expect(page.getByRole('alert').filter({ hasText: "didn't load just now" })).toHaveCount(1)
  await expect(add(page)).toBeVisible()
  await expect(page.getByText('No schedule yet.')).toHaveCount(0)
  app.worker.clear()
  await page.getByRole('button', { name: 'Retry' }).click()
  await expect(row(page, scheduled)).toBeVisible()
  await expect(page.getByRole('alert').filter({ hasText: 'load just now' })).toHaveCount(0)
})

test.describe('direct links to one medication', () => {
  const linkedId = randomUUID()
  const linked = 'Magnesium'

  test.use({
    journey: {
      auth: true,
      storage: true,
      initialScheduleTime,
      seed: ({ db, ownerId }) => insertMedicine(db, ownerId, linked, linkedId),
    },
  })

  // Streaming: the shell and the view's own fallback appear before the held reads return.
  const views = [
    {
      name: 'medication page',
      path: `/medications?medicine=${linkedId}`,
      fallback: medicationFallback,
      backRow: 'Medications',
    },
  ]

  for (const view of views)
    test(`the ${view.name} streams its fallback, then content, in a stable layout`, async ({
      page,
      app,
    }) => {
      const api = countApiRequests(page, app.origin)
      const layout = await trackLayout(page, layoutViewports.phone)
      for (const route of reads) app.worker.hold(route)
      await page.goto(view.path, { waitUntil: 'commit' })
      await expectReadsOverlap(app.worker, reads)
      await expect(view.fallback(page)).toBeVisible()
      await expect(page.getByRole('navigation', { name: 'Primary' })).toBeVisible()
      await expect(rootFallback(page)).toHaveCount(0)
      await expect(fallback(page)).toHaveCount(0)
      await expect(title(page)).toHaveCount(0)
      await expect(page.getByRole('status')).toHaveCount(1)
      for (const placeholder of await placeholders(page).all())
        await expect(placeholder).toHaveAttribute('aria-hidden', 'true')
      await layout.snapshot('fallback')

      const heading = page.getByRole('heading', { level: 1, name: linked })
      await expectStreamingOrder(app.worker, {
        routes: reads,
        fallback: view.fallback(page),
        content: heading,
      })
      await expect(heading).toBeFocused()
      await expect(
        page.getByRole('main').getByRole('link', { name: view.backRow, exact: true }),
      ).toBeVisible()
      await expect(placeholders(page)).toHaveCount(0)
      await page.waitForLoadState('load')
      expectNoRepeatedReads(api)
      await layout.snapshot('loaded')

      const result = await layout.result()
      const [fallbackBoxes, loadedBoxes] = result.snapshots.map((snapshot) => snapshot.boxes)
      expect(loadedBoxes, 'the Back row and nav keep their geometry').toEqual(fallbackBoxes)
      // Same budget as Today, History and the list. The skeleton is replaced rather than moved, and
      // it reserves each line of a one-line name, as this fixture has, so any shift is a regression.
      expect(result.cumulativeLayoutShift).toBeLessThanOrEqual(layoutShiftBudget)
    })

  test('schedule setup streams its fallback, then the full-screen modal', async ({ page, app }) => {
    const api = countApiRequests(page, app.origin)
    for (const route of reads) app.worker.hold(route)
    await page.goto(`/medications?schedule=${linkedId}`, { waitUntil: 'commit' })
    await expectReadsOverlap(app.worker, reads)
    await expect(medicationSetupFallback(page)).toBeVisible()
    await expect(page.getByRole('navigation', { name: 'Primary' })).toBeVisible()
    const heading = page.getByRole('heading', { level: 1, name: linked })
    await expectStreamingOrder(app.worker, {
      routes: reads,
      fallback: medicationSetupFallback(page),
      content: heading,
    })
    await expect(heading).toBeFocused()
    // The modal covers the tab bar (212·C0).
    await expect(page.getByRole('button', { name: 'Cancel', exact: true })).toBeVisible()
    await expect(page.getByRole('navigation', { name: 'Primary' })).toBeHidden()
    await expect(placeholders(page)).toHaveCount(0)
    await page.waitForLoadState('load')
    expectNoRepeatedReads(api)
  })

  test('a link to a medication that is not in the list shows not found', async ({ page, app }) => {
    for (const route of reads) app.worker.hold(route)
    await page.goto(`/medications?medicine=${randomUUID()}`, { waitUntil: 'commit' })
    await expect(medicationFallback(page)).toBeVisible()
    for (const route of reads) app.worker.release(route)
    await expect(page.getByText("This medication isn't in your list")).toBeVisible()
    await expect(page.getByRole('link', { name: 'Open Medications' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Set schedule' })).toHaveCount(0)
  })
})

test.describe('without a session', () => {
  test.use({ journey: { auth: false, storage: true, initialScheduleTime } })

  test('performs no private reads and hydrates no private data', async ({ page, app }) => {
    const id = randomUUID()
    for (const path of [
      '/medications',
      `/medications?medicine=${id}`,
      `/medications?schedule=${id}`,
    ]) {
      await page.goto(path)
      await expect(page).toHaveURL(`${app.origin}/?returnTo=${encodeURIComponent(path)}`)
      for (const route of reads) expect(app.worker.requests(route)).toHaveLength(0)
      expect(await page.content()).not.toContain(scheduled)
    }
  })
})
