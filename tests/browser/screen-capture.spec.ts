import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import {
  focusWindow,
  resizeTextForReview,
  hydrated,
  scrollsHorizontally,
  stylesheetsLoaded,
} from './actions'
import { captureCases } from './capture'
import { expect, test } from './fixtures'
import { drawer, loadingStatus, toastMessage } from './locators'
import { addDays, insertScheduledMedicine } from './seed'

// Opt-in screenshots of signed-in Today and Medications screens for visual verification,
// never a CI assertion. Seeds one medicine with a daily schedule, opens each path at 402x874
// and fails on horizontal overflow. Run with
// MEDDIES_VISUAL_OUT=<dir> MEDDIES_SCREENS=/,/medications pnpm test:browser:visual screen-capture
const initialScheduleTime = '2035-06-15T09:00:00+03:00'
const today = initialScheduleTime.slice(0, 10)
/** Seeded IDs, for paths such as `/medications?medicine=<medicineId>`. */
const medicineId = '00000000-0000-4000-8000-0000000d0001'
const scheduleId = '00000000-0000-4000-8000-0000000d0002'
const out = process.env.MEDDIES_VISUAL_OUT
const screens = process.env.MEDDIES_SCREENS

function parseScreens(selection: string) {
  const paths = [...new Set(selection.split(',').map((path) => path.trim()))]
  for (const path of paths)
    if (!/^\/(\?|$)|^\/medications(\?|$)/.test(path))
      throw new Error(`Not a Today or Medications path: ${JSON.stringify(path)}`)
  return paths
}

/** `/medications?medicine=…` → `medications-medicine-…`; `/` → `today`. */
function fileName(path: string) {
  const slug = path.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '')
  return `${slug.startsWith('medications') ? slug : `today${slug ? `-${slug}` : ''}`}.png`
}

test.use({
  journey: {
    auth: true,
    givenName: 'AlexandriaЖанайым',
    storage: true,
    initialScheduleTime,
    seed: ({ db, ownerId }) =>
      insertScheduledMedicine(db, ownerId, {
        label: 'Capture Fixture Medicine',
        startDate: addDays(today, -1),
        times: [{ time: '08:00', quantity: 1 }],
        medicineId,
        scheduleId,
      }),
  },
})

test('capture signed-in screens for review', { tag: '@visual' }, async ({ page }) => {
  // eslint-disable-next-line playwright/no-skipped-test -- opt-in capture, never a CI assertion
  test.skip(!out || !screens, 'Set MEDDIES_VISUAL_OUT and MEDDIES_SCREENS to capture screens')
  test.setTimeout(120_000)
  const paths = parseScreens(screens!)
  const { viewport, reducedMotion } = captureCases.phone
  await mkdir(resolve(out!), { recursive: true })
  await page.setViewportSize(viewport)
  await page.emulateMedia({ reducedMotion })

  const captures: { path: string; horizontalOverflow: boolean }[] = []
  for (const path of paths) {
    await page.goto(path)
    await expect.poll(() => hydrated(page), { message: `${path} should hydrate` }).toBe(true)
    await expect
      .poll(() => stylesheetsLoaded(page), { message: 'stylesheets should load' })
      .toBe(true)
    await expect(loadingStatus(page)).toHaveCount(0)
    // Screen-size, not full-page: what the phone shows without scrolling.
    await page.screenshot({ path: resolve(out!, fileName(path)), animations: 'disabled' })
    captures.push({ path, horizontalOverflow: await scrollsHorizontally(page) })
  }
  const overflowing = captures.filter((capture) => capture.horizontalOverflow)
  expect(
    overflowing.map((capture) => capture.path),
    `Horizontal overflow at 402x874; captures in ${out}`,
  ).toEqual([])
})

// Opt-in production form evidence at 402x874 with normal text.
test('capture medication record forms and recovery', { tag: '@visual' }, async ({ page }) => {
  // eslint-disable-next-line playwright/no-skipped-test -- opt-in visual evidence
  test.skip(!out || process.env.MEDDIES_RECORD_CAPTURE !== '1', 'Set MEDDIES_RECORD_CAPTURE=1')
  test.setTimeout(120_000)
  await mkdir(resolve(out!), { recursive: true })
  const detail = `/medications?medicine=${medicineId}`
  await page.setViewportSize(captureCases.phone.viewport)
  for (const record of ['fix', 'strength', 'history']) {
    await page.goto(`${detail}&record=${record}`)
    await expect(
      page.getByRole('heading', {
        name:
          record === 'fix'
            ? 'Fix a mistake'
            : record === 'strength'
              ? 'Change strength'
              : 'Strength history',
        exact: true,
      }),
    ).toBeVisible()
    await expect.poll(() => stylesheetsLoaded(page)).toBe(true)
    expect(await scrollsHorizontally(page)).toBe(false)
    await page.screenshot({
      path: resolve(out!, `record-${record}-402.png`),
      fullPage: true,
    })
  }
  await page.goto(`${detail}&record=strength`)
  await page.getByRole('button', { name: 'Save strength change' }).click()
  await page.getByRole('textbox', { name: 'New strength' }).press('Tab')
  await page.keyboard.press('Shift+Tab')
  await expect(page.getByRole('textbox', { name: 'New strength' })).toBeFocused()
  expect(await scrollsHorizontally(page)).toBe(false)
  await page.screenshot({
    path: resolve(out!, 'record-strength-402-focus.png'),
  })
  await page.goto(`${detail}&record=fix`)
  await page.context().setOffline(true)
  await expect(page.getByRole('button', { name: 'Connect to save' })).toBeDisabled()
  await page.screenshot({ path: resolve(out!, 'record-offline.png'), fullPage: true })
  await page.context().setOffline(false)
  await page.route('**/api/medicines', async (route) =>
    route.request().method() === 'PATCH'
      ? route.fulfill({
          status: 409,
          contentType: 'application/json',
          body: '{"error":"conflict"}',
        })
      : route.fallback(),
  )
  await page.getByRole('button', { name: 'Save fixed details' }).click()
  await expect(page.getByRole('button', { name: 'Review saved medication' })).toBeVisible()
  await page.screenshot({ path: resolve(out!, 'record-conflict.png'), fullPage: true })
})

// Opt-in copy review for empty, grouped and scheduled states at 402x874 with normal text.
for (const state of ['empty', 'no-schedule', 'future-schedule'] as const) {
  test.describe(state, () => {
    test.use({
      journey: {
        auth: true,
        storage: true,
        initialScheduleTime,
        seed: async ({ db, ownerId }) => {
          if (state === 'future-schedule') {
            await insertScheduledMedicine(db, ownerId, {
              label: 'Capture Fixture Medicine',
              startDate: addDays(today, 1),
              times: [{ time: '08:00', quantity: 1 }],
            })
          } else if (state === 'no-schedule') {
            await db
              .prepare(
                'INSERT INTO user_medications(owner_id,id,label,strength,unit) VALUES(?,?,?,?,?)',
              )
              .bind(ownerId, medicineId, 'Capture Fixture Medicine', '10 mg', 'tablet')
              .run()
          }
        },
      },
    })

    /* eslint-disable playwright/no-conditional-in-test, playwright/no-conditional-expect -- opt-in checks vary by captured state. */
    test('capture schedule copy at normal text', { tag: '@visual' }, async ({ page, app }) => {
      // eslint-disable-next-line playwright/no-skipped-test -- opt-in visual evidence
      test.skip(!out || process.env.MEDDIES_COPY_CAPTURE !== '1', 'Set MEDDIES_COPY_CAPTURE=1')
      test.setTimeout(120_000)
      await mkdir(resolve(out!), { recursive: true })
      const cases: { path: string; heading: string | RegExp; action?: string }[] = {
        empty: [
          { path: '/', heading: 'No medications yet', action: 'Add medication' },
          { path: '/medications', heading: 'No medications yet', action: 'Add medication' },
          { path: '/history', heading: 'No dose history yet', action: 'Add medication' },
        ],
        'no-schedule': [
          { path: '/', heading: 'No scheduled doses', action: 'Set schedule' },
          {
            path: '/medications',
            heading: 'No schedule',
            action: 'View details for Capture Fixture Medicine',
          },
          { path: '/history', heading: 'Nothing due yet today' },
          { path: '/history?date=2035-06-14', heading: /^Nothing was scheduled on/ },
        ],
        'future-schedule': [{ path: '/', heading: 'No doses scheduled today' }],
      }[state]
      for (const { path, heading, action } of cases) {
        await page.setViewportSize(captureCases.phone.viewport)
        await page.goto(path)
        await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible()
        await expect.poll(() => hydrated(page)).toBe(true)
        await expect.poll(() => stylesheetsLoaded(page)).toBe(true)
        await expect(loadingStatus(page)).toHaveCount(0)
        expect(await scrollsHorizontally(page)).toBe(false)
        if (action)
          await page.getByRole('link', { name: action, exact: true }).click({ trial: true })
        if (path.startsWith('/history')) {
          await page.getByRole('button', { name: /Choose a date/ }).click({ trial: true })
        } else if (path === '/') {
          await page.getByRole('button', { name: 'Refresh Today' }).click({ trial: true })
        }
        const screen = path === '/' ? 'today' : path.slice(1).replace('?date=', '-')
        await page.screenshot({
          path: resolve(out!, `copy-${state}-${screen}-402.png`),
          fullPage: true,
        })
      }
      if (state === 'future-schedule') {
        await app.setScheduleTime('2035-06-16T09:00:00+03:00')
        await page.setViewportSize(captureCases.phone.viewport)
        await page.goto('/history')
        await expect(page.getByText('0 of 1 scheduled doses logged')).toBeVisible()
        await expect.poll(() => stylesheetsLoaded(page)).toBe(true)
        expect(await scrollsHorizontally(page)).toBe(false)
        await page.screenshot({
          path: resolve(out!, `copy-history-summary-402.png`),
          fullPage: true,
        })
      }
    })
    /* eslint-enable playwright/no-conditional-in-test, playwright/no-conditional-expect */
  })
}

// Copy-only recovery review, opt-in rather than a new CI browser journey.
test('capture save recovery copy', { tag: '@visual' }, async ({ page }) => {
  // eslint-disable-next-line playwright/no-skipped-test -- opt-in visual evidence
  test.skip(!out || process.env.MEDDIES_SAVE_CAPTURE !== '1', 'Set MEDDIES_SAVE_CAPTURE=1')
  test.setTimeout(120_000)
  await mkdir(resolve(out!), { recursive: true })
  await page.setViewportSize(captureCases.phone.viewport)
  await page.goto(`/medications?medicine=${medicineId}&record=fix`)
  await expect(page.getByRole('heading', { name: 'Fix a mistake' })).toBeVisible()
  await expect.poll(() => stylesheetsLoaded(page)).toBe(true)
  await page.context().setOffline(true)
  await expect(
    page.getByText('Keep Meddies open to retain these details. Reconnect to save.'),
  ).toBeVisible()
  await page
    .getByRole('alert')
    .filter({ hasText: /Reconnect to save/ })
    .scrollIntoViewIfNeeded()
  expect(await scrollsHorizontally(page)).toBe(false)
  await page.screenshot({
    path: resolve(out!, `save-offline-402.png`),
  })
  await page.context().setOffline(false)
  await page.goto(`/medications?medicine=${medicineId}&record=fix`)
  await expect(page.getByRole('heading', { name: 'Fix a mistake' })).toBeVisible()
  await page.route('**/api/medicines', async (route) =>
    route.request().method() === 'PATCH'
      ? route.fulfill({
          status: 409,
          contentType: 'application/json',
          body: '{"error":"conflict"}',
        })
      : route.fallback(),
  )
  await page.getByRole('button', { name: 'Save fixed details' }).click()
  await expect(
    page.getByRole('alert').filter({ hasText: /changed elsewhere|might not have saved/ }),
  ).toContainText('This medication changed elsewhere.')
  await page.getByRole('button', { name: 'Review saved medication' }).click({ trial: true })
  expect(await scrollsHorizontally(page)).toBe(false)
  await page.screenshot({
    path: resolve(out!, `save-conflict-402.png`),
  })
  await page.unroute('**/api/medicines')

  await page.goto('/')
  await page.getByRole('button', { name: /^Record dose for Capture Fixture Medicine/ }).click()
  await page.getByRole('button', { name: 'I took it', exact: true }).click()
  await page.route('**/api/schedules', async (route) =>
    route.request().method() === 'PUT'
      ? route.fulfill({ status: 503, contentType: 'application/json', body: '{}' })
      : route.fallback(),
  )
  await page.getByRole('button', { name: 'Save as taken', exact: true }).click()
  await expect(
    page.getByRole('alert').filter({ hasText: /changed elsewhere|might not have saved/ }),
  ).toContainText("Check your connection, then retry. Retrying won't save it twice.")
  await page.getByRole('button', { name: 'Try saving as taken again' }).click({ trial: true })
  expect(await scrollsHorizontally(page)).toBe(false)
  await page.screenshot({
    path: resolve(out!, `save-uncertain-402.png`),
  })
  await page.getByLabel(/^Amount/).fill('2')
  await expect(
    page.getByRole('alert').filter({ hasText: /changed elsewhere|might not have saved/ }),
  ).toContainText('Changing details starts a new save.')
  await page.getByRole('button', { name: 'Save as taken', exact: true }).click({ trial: true })
  await page.screenshot({
    path: resolve(out!, `save-changed-402.png`),
  })
  await page.unroute('**/api/schedules')
  await page.goto('/')
  await page.getByRole('button', { name: /^Record dose for Capture Fixture Medicine/ }).click()
  await page.getByRole('button', { name: 'I skipped it', exact: true }).click()
  await page.context().setOffline(true)
  await expect(page.getByText("You're offline. Reconnect to save.")).toBeVisible()
  await page
    .getByRole('alert')
    .filter({ hasText: /Reconnect to save/ })
    .scrollIntoViewIfNeeded()
  expect(await scrollsHorizontally(page)).toBe(false)
  await page.screenshot({ path: resolve(out!, `save-skipped-402.png`) })
  await page.context().setOffline(false)

  async function captureDoseReceipt({
    name,
    path,
    open,
    save,
    receipt,
  }: {
    name: string
    path: string
    open: () => Promise<void>
    save: string
    receipt: string
  }) {
    await page.goto(path)
    await open()
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByRole('heading', { name: 'Capture Fixture Medicine' })).toBeVisible()
    await expect(dialog.getByLabel(/^Amount/)).toBeVisible()
    const restoreDrawerText = await resizeTextForReview(page)
    for (const width of [402, 320]) {
      await page.setViewportSize({ width, height: 874 })
      await dialog.getByRole('button', { name: save }).scrollIntoViewIfNeeded()
      await expect(dialog.getByRole('button', { name: save })).toBeVisible()
      expect(await scrollsHorizontally(page)).toBe(false)
      await page.screenshot({ path: resolve(out!, `receipt-${name}-form-${width}-200.png`) })
    }
    await restoreDrawerText()
    await dialog.getByRole('button', { name: save }).click()
    await expect(drawer(page)).toHaveCount(0)
    await expect(toastMessage(page, receipt)).toBeVisible()
    await expect(page.getByRole('region', { name: 'Notifications' })).toHaveAttribute(
      'aria-live',
      'polite',
    )
    const restoreReceiptText = await resizeTextForReview(page)
    for (const width of [402, 320]) {
      await page.setViewportSize({ width, height: 874 })
      await expect(toastMessage(page, receipt)).toBeVisible()
      await expect(page.getByRole('region', { name: 'Notifications' })).toHaveAttribute(
        'aria-live',
        'polite',
      )
      expect(await scrollsHorizontally(page)).toBe(false)
      await page.screenshot({ path: resolve(out!, `receipt-${name}-${width}-200.png`) })
    }
    await restoreReceiptText()
  }

  await captureDoseReceipt({
    name: 'scheduled',
    path: '/',
    open: async () => {
      await page.getByRole('button', { name: /^Record dose for Capture Fixture Medicine/ }).click()
      await page.getByRole('button', { name: 'I took it', exact: true }).click()
    },
    save: 'Save as taken',
    receipt: 'Capture Fixture Medicine 08:00 · Taken at 09:00, 1 tablet',
  })
  await captureDoseReceipt({
    name: 'unscheduled',
    path: `/medications?medicine=${medicineId}`,
    open: async () => {
      await page.getByRole('button', { name: 'Log a dose', exact: true }).click()
    },
    save: 'Save as taken',
    receipt: 'Capture Fixture Medicine · Taken at 09:00, 1 tablet',
  })
})

// Opt-in read-recovery review, using the existing seeded screen-capture infrastructure.
test('capture read recovery copy', { tag: '@visual' }, async ({ page, app }) => {
  // eslint-disable-next-line playwright/no-skipped-test -- opt-in visual evidence
  test.skip(!out || process.env.MEDDIES_READ_CAPTURE !== '1', 'Set MEDDIES_READ_CAPTURE=1')
  test.setTimeout(180_000)
  await mkdir(resolve(out!), { recursive: true })
  const reads = [
    { method: 'POST', path: '/medicines', operation: 'list' },
    { method: 'POST', path: '/schedules', operation: 'listOutcomes' },
  ]
  const results: unknown[] = []
  async function capture(name: string) {
    await expect.poll(() => stylesheetsLoaded(page)).toBe(true)
    const restoreText = await resizeTextForReview(page)
    for (const width of [402, 320]) {
      await page.setViewportSize({ width, height: 874 })
      await expect.poll(() => scrollsHorizontally(page)).toBe(false)
      for (const action of await page
        .getByRole('button', { name: 'Try again', exact: true })
        .all()) {
        await action.scrollIntoViewIfNeeded()
        await expect(action).toBeVisible()
        await action.focus()
        await expect(action).toBeFocused()
      }
      await page.screenshot({
        path: resolve(out!, `read-${name}-${width}-200.png`),
        fullPage: true,
      })
      results.push({
        name,
        width,
        textPercent: 200,
        outline: await page.getByRole('main').ariaSnapshot(),
      })
    }
    await restoreText()
  }
  for (const read of reads) app.worker.fail(read, 503)
  await page.goto('/')
  await expect(page.getByText('Couldn’t load Today. Check your connection.')).toBeVisible()
  await capture('today-unavailable')
  app.worker.clear()
  await page
    .getByRole('alert')
    .filter({ hasText: 'Couldn’t load medications.' })
    .getByRole('button')
    .press('Enter')
  await page
    .getByRole('alert')
    .filter({ hasText: 'Couldn’t load Today.' })
    .getByRole('button')
    .press('Enter')
  await expect(page.getByText('Capture Fixture Medicine').first()).toBeVisible()
  for (const read of reads) app.worker.fail(read, 503)
  await focusWindow(page)
  await expect(
    page.getByText('Couldn’t update Today. Showing previously loaded details.'),
  ).toBeVisible()
  await capture('today-cached')
  app.worker.clear()
  await page.goto('/medications')
  await expect(page.getByText('Capture Fixture Medicine')).toBeVisible()
  for (const read of reads) app.worker.fail(read, 503)
  await page.clock.install()
  await page.clock.fastForward('00:31')
  await focusWindow(page)
  await expect(
    page.getByText(/Couldn’t update medications. Showing details loaded at/),
  ).toBeVisible()
  await capture('medications-cached')
  await page.getByRole('link', { name: /Capture Fixture Medicine/ }).press('Enter')
  await expect(page.getByRole('heading', { name: 'Capture Fixture Medicine' })).toBeVisible()
  await capture('detail-cached')
  await page.goto(`/medications?medicine=${medicineId}`)
  await expect(page.getByText('Couldn’t load medication.')).toBeVisible()
  await capture('detail-unavailable')
  app.worker.clear()
  await page.route('**/api/schedules', (route) => route.fulfill({ status: 503, body: '{}' }))
  // A failed server schedule read is separate from medication absence.
  app.worker.fail(reads[1], 503)
  await page.goto(`/medications?medicine=${medicineId}`)
  await expect(
    page.getByText("Capture Fixture Medicine's schedule couldn't be checked.", { exact: false }),
  ).toBeVisible()
  await expect(page.getByRole('link', { name: 'Set schedule', exact: true })).toHaveCount(0)
  await capture('schedule-unknown')
  await page.goto('/history?date=2035-06-14')
  await expect(page.getByText('Couldn’t load History for Thu 14 Jun.')).toBeVisible()
  await capture('history-unavailable')
  app.worker.clear()
  await page.goto('/missing-copy-review')
  await expect(page.getByRole('heading', { name: 'Page not found' })).toHaveCount(1)
  await expect(page.getByRole('heading')).toHaveCount(1)
  const openToday = page.getByRole('link', { name: 'Open Today' })
  await capture('404')
  await openToday.scrollIntoViewIfNeeded()
  await openToday.focus()
  await expect(openToday).toBeFocused()
  await openToday.press('Enter')
  await expect(page).toHaveURL(app.origin + '/')
  await writeFile(resolve(out!, 'read-review.json'), JSON.stringify(results, null, 2))
})
