import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { hydrated, scrollsHorizontally, stylesheetsLoaded } from './actions'
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
