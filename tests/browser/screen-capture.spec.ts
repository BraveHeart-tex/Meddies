import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { enlargeTextOnly, hydrated, scrollsHorizontally, stylesheetsLoaded } from './actions'
import { captureCases } from './capture'
import { expect, test } from './fixtures'
import { loadingStatus } from './locators'
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

// Opt-in production form evidence. Width/text probes stay outside CI journeys.
test('capture medication record forms and recovery', { tag: '@visual' }, async ({ page }) => {
  // eslint-disable-next-line playwright/no-skipped-test -- opt-in visual evidence
  test.skip(!out || process.env.MEDDIES_RECORD_CAPTURE !== '1', 'Set MEDDIES_RECORD_CAPTURE=1')
  test.setTimeout(120_000)
  await mkdir(resolve(out!), { recursive: true })
  const detail = `/medications?medicine=${medicineId}`
  for (const width of [402, 320]) {
    await page.setViewportSize({ width, height: 874 })
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
        path: resolve(out!, `record-${record}-${width}.png`),
        fullPage: true,
      })
    }
  }
  await page.setViewportSize({ width: 320, height: 874 })
  await page.goto(`${detail}&record=strength`)
  await page.getByRole('button', { name: 'Save strength change' }).click()
  await enlargeTextOnly(page, 2)
  await page.getByRole('textbox', { name: 'New strength' }).press('Tab')
  await page.keyboard.press('Shift+Tab')
  await expect(page.getByRole('textbox', { name: 'New strength' })).toBeFocused()
  expect(await scrollsHorizontally(page)).toBe(false)
  await page.screenshot({
    path: resolve(out!, 'record-strength-320-text200-focus.png'),
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

// Opt-in copy review for empty, grouped and scheduled states at synthetic 200% text.
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
    test('capture schedule copy at enlarged text', { tag: '@visual' }, async ({ page, app }) => {
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
        for (const width of [402, 320]) {
          await page.setViewportSize({ width, height: 874 })
          await page.goto(path)
          await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible()
          await expect.poll(() => hydrated(page)).toBe(true)
          await expect.poll(() => stylesheetsLoaded(page)).toBe(true)
          await expect(loadingStatus(page)).toHaveCount(0)
          await enlargeTextOnly(page, 2)
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
            path: resolve(out!, `copy-${state}-${screen}-${width}-text200.png`),
            fullPage: true,
          })
        }
      }
      if (state === 'future-schedule') {
        await app.setScheduleTime('2035-06-16T09:00:00+03:00')
        for (const width of [402, 320]) {
          await page.setViewportSize({ width, height: 874 })
          await page.goto('/history')
          await expect(page.getByText('0 of 1 scheduled doses logged')).toBeVisible()
          await expect.poll(() => stylesheetsLoaded(page)).toBe(true)
          await enlargeTextOnly(page, 2)
          expect(await scrollsHorizontally(page)).toBe(false)
          await page.screenshot({
            path: resolve(out!, `copy-history-summary-${width}-text200.png`),
            fullPage: true,
          })
        }
      }
    })
    /* eslint-enable playwright/no-conditional-in-test, playwright/no-conditional-expect */
  })
}
