import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import {
  archiveMedicine,
  openConfirmationWithMotion,
  focusWindow,
  hydrated,
  scrollsHorizontally,
  stylesheetsLoaded,
  toastTransitionProperties,
  waitForClientLink,
} from './actions'
import { dragHandle, drawerAtRest, drawerBottom } from './drawers'
import { captureCases } from './capture'
import { captureSettled } from './settled-capture'
import { expect, test } from './fixtures'
import { drawer, loadingStatus, toastMessage } from './locators'
import { pickTime } from './pickers'
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

// Opt-in #348 cold Add recording on the local Next.js and Worker/D1 fixture stack.
test.describe('cold Add recording', () => {
  test('capture one Add tap while the list streams', { tag: '@visual' }, async ({ page, app }) => {
    // eslint-disable-next-line playwright/no-skipped-test -- opt-in interaction evidence
    test.skip(!out || process.env.MEDDIES_ADD_CAPTURE !== '1', 'Set MEDDIES_ADD_CAPTURE=1')
    await mkdir(resolve(out!), { recursive: true })
    const reads = [
      { method: 'POST', path: '/medicines', operation: 'list' },
      { method: 'POST', path: '/schedules', operation: 'listOutcomes' },
    ]
    for (const read of reads) app.worker.hold(read)
    await page.goto('/medications', { waitUntil: 'commit' })
    await waitForClientLink(page.getByRole('link', { name: 'Add a medication' }))
    await expect(page.getByRole('status')).toContainText('Loading medications')
    const add = page.getByRole('link', { name: 'Add a medication' })
    await add.click()
    await expect(drawer(page)).toBeVisible()
    await page.getByRole('textbox', { name: 'Name', exact: true }).fill('Draft stays open')
    app.worker.release()
    await expect(page.getByRole('status')).toHaveCount(0)
    await expect(drawer(page)).toBeVisible()
    await expect(page.getByRole('textbox', { name: 'Name', exact: true })).toHaveValue(
      'Draft stays open',
    )
    await drawerAtRest(page)
    await captureSettled(page, { path: resolve(out!, 'cold-add.png'), fullPage: true })
    await page.keyboard.press('Escape')
    await expect(drawer(page)).toBeHidden()
    await expect(
      page.getByRole('link', { name: 'View details for Capture Fixture Medicine' }),
    ).toBeVisible()
    await expect(add).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(drawer(page)).toBeVisible()
    await expect(page.getByRole('status')).toHaveCount(0)
    await expect(page.getByRole('textbox', { name: 'Name', exact: true })).toHaveValue('')
    await drawerAtRest(page)
    await captureSettled(page, { path: resolve(out!, 'loaded-add.png'), fullPage: true })
  })
})

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
  video: process.env.MEDDIES_ADD_CAPTURE === '1' ? 'on' : 'off',
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
// The four approved #347 states, using the production form and real record reads.
test.describe('Edit details groups', () => {
  const records = [
    ['00000000-0000-4000-8000-000000350001', 'Vitamin D', '1000 IU', 'tablet', false],
    ['00000000-0000-4000-8000-000000350002', 'Magnesium', '200 mg', 'tablet', true],
    ['00000000-0000-4000-8000-000000350003', 'Ibuprofen syrup', '100 mg/5 ml', 'liquid', false],
    ['00000000-0000-4000-8000-000000350004', 'Amoxicillin', '250 mg/5 ml', 'liquid', true],
  ] as const
  test.use({
    journey: {
      auth: true,
      storage: true,
      initialScheduleTime: '2026-11-09T09:00:00+03:00',
      seed: async ({ db, ownerId }) => {
        for (const [id, label, strength, unit, locked] of records) {
          await db
            .prepare(
              'INSERT INTO user_medications(owner_id,id,label,strength,unit,ever_had_schedule) VALUES(?,?,?,?,?,?)',
            )
            .bind(ownerId, id, label, strength, unit, Number(locked))
            .run()
        }
        const id = records[3][0]
        await db
          .prepare(
            'UPDATE medicine_strength_revisions SET strength=? WHERE owner_id=? AND medicine_id=?',
          )
          .bind('125 mg/5 ml', ownerId, id)
          .run()
        await db
          .prepare(
            'INSERT INTO medicine_strength_revisions(owner_id,medicine_id,id,strength,label,unit,effective_at,sequence) VALUES(?,?,?,?,?,?,?,?)',
          )
          .bind(
            ownerId,
            id,
            '00000000-0000-4000-8000-000000350005',
            '250 mg/5 ml',
            'Amoxicillin',
            'liquid',
            '2026-11-04T06:00:00.000Z',
            1,
          )
          .run()
      },
    },
  })

  test('capture Edit details groups', { tag: '@visual' }, async ({ page }) => {
    // eslint-disable-next-line playwright/no-skipped-test -- opt-in visual evidence
    test.skip(!out || process.env.MEDDIES_RECORD_CAPTURE !== '1', 'Set MEDDIES_RECORD_CAPTURE=1')
    await mkdir(resolve(out!), { recursive: true })
    for (const [index, [id]] of records.entries()) {
      await page.goto(`/medications?medicine=${id}&record=fix`)
      await expect(page.getByRole('heading', { name: 'Edit details', exact: true })).toBeVisible()
      await expect.poll(() => stylesheetsLoaded(page)).toBe(true)
      expect(await scrollsHorizontally(page)).toBe(false)
      await captureSettled(page, {
        path: resolve(out!, `record-347-c${index + 1}-402.png`),
        style: 'nextjs-portal { display: none !important; }',
      })
    }
    await page.goto(`/medications?medicine=${records[0][0]}&record=fix`)
    const name = page.getByRole('textbox', { name: 'Name', exact: true })
    await name.fill('')
    await page.getByRole('button', { name: 'Save details' }).click()
    await expect(name).toBeFocused()
    await expect(page.getByText('Enter the medication name.')).toBeVisible()
    await captureSettled(page, {
      style: 'nextjs-portal { display: none !important; }',
      path: resolve(out!, 'record-groups-validation-402.png'),
    })
    const type = page.getByRole('combobox', { name: 'Type' })
    await type.focus()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('option', { name: 'Liquid', exact: true })).toBeVisible()
    await captureSettled(page, {
      style: 'nextjs-portal { display: none !important; }',
      path: resolve(out!, 'record-groups-type-menu-402.png'),
    })
    await page.keyboard.press('Escape')
    await expect(type).toBeFocused()
  })
})

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
            ? 'Edit details'
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
  await page.getByRole('button', { name: 'Save details' }).click()
  await expect(page.getByRole('button', { name: 'Review saved medication' })).toBeVisible()
  await page.screenshot({ path: resolve(out!, 'record-conflict.png'), fullPage: true })
})

// Opt-in Archived medications evidence at 402x874: empty state, list, detail and keyboard focus.
// The seeded medicine is archived through the API until archive confirmation ships (#327).
test('capture archived medications', { tag: '@visual' }, async ({ page }) => {
  // eslint-disable-next-line playwright/no-skipped-test -- opt-in visual evidence
  test.skip(!out || process.env.MEDDIES_ARCHIVED_CAPTURE !== '1', 'Set MEDDIES_ARCHIVED_CAPTURE=1')
  test.setTimeout(120_000)
  await mkdir(resolve(out!), { recursive: true })
  await page.setViewportSize(captureCases.phone.viewport)
  const shot = async (name: string) => {
    await expect.poll(() => stylesheetsLoaded(page)).toBe(true)
    await expect(loadingStatus(page)).toHaveCount(0)
    expect(await scrollsHorizontally(page)).toBe(false)
    await page.screenshot({ path: resolve(out!, `archived-${name}-402.png`) })
  }
  await page.goto('/medications?archived')
  await expect(page.getByRole('heading', { name: 'No archived medications' })).toBeVisible()
  await shot('empty')

  const archived = await archiveMedicine(page, medicineId)
  expect(archived).toMatch(/^200 /)
  await page.goto('/medications')
  await expect(page.getByRole('heading', { name: 'No medications yet' })).toBeVisible()
  await page.getByRole('link', { name: 'Archived medications' }).focus()
  await shot('entry')
  await page.keyboard.press('Enter')
  const row = page.getByRole('link', { name: /^Capture Fixture Medicine/ })
  await expect(row).toBeVisible()
  // Keyboard order: Back, then the row.
  await page.keyboard.press('Tab')
  await expect(page.getByRole('main').getByRole('link', { name: 'Medications' })).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(row).toBeFocused()
  await shot('list')
  await page.keyboard.press('Enter')
  await expect(
    page.getByRole('heading', { level: 1, name: 'Capture Fixture Medicine' }),
  ).toBeVisible()
  await page.keyboard.press('Tab')
  await expect(
    page.getByRole('main').getByRole('link', { name: 'Archived medications' }),
  ).toBeFocused()
  await shot('detail')
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

// Opt-in Amount input review (#265): Clock time rows with singular and plural units, then the
// Interval Amount sheet, on the seeded tablet's Change schedule.
test('capture schedule amount inputs', { tag: '@visual' }, async ({ page }) => {
  // eslint-disable-next-line playwright/no-skipped-test -- opt-in visual evidence
  test.skip(!out || process.env.MEDDIES_AMOUNT_CAPTURE !== '1', 'Set MEDDIES_AMOUNT_CAPTURE=1')
  test.setTimeout(120_000)
  await mkdir(resolve(out!), { recursive: true })
  await page.setViewportSize(captureCases.phone.viewport)
  await page.emulateMedia({ reducedMotion: captureCases.phone.reducedMotion })
  await page.goto(`/medications?schedule=${medicineId}`)
  await expect.poll(() => hydrated(page)).toBe(true)
  await expect.poll(() => stylesheetsLoaded(page)).toBe(true)
  await page.getByRole('button', { name: 'Add another time' }).click()
  await pickTime(page, 'Time 2', '20:00')
  await page.getByLabel('Amount for time 2').fill('2')
  const [first, second] = await Promise.all(
    [1, 2].map((row) => page.getByLabel(`Amount for time ${row}`).boundingBox()),
  )
  expect(second?.width, 'singular and plural rows share one input width').toBe(first?.width)
  expect(await scrollsHorizontally(page)).toBe(false)
  await page.getByLabel('Amount for time 2').blur()
  await captureSettled(page, { path: resolve(out!, 'amount-clock-rows-402.png'), fullPage: true })

  await page.getByRole('button', { name: 'Every few hours' }).click()
  await page.getByRole('button', { name: /^Amount:/ }).click()
  const sheet = page.getByRole('dialog', { name: 'Amount' })
  const amount = sheet.getByRole('textbox', { name: 'Amount' })
  await amount.fill('2')
  await amount.blur()
  await expect(sheet).toBeVisible()
  expect(await scrollsHorizontally(page)).toBe(false)
  await captureSettled(page, { path: resolve(out!, 'amount-interval-sheet-402.png') })
})

// Copy-only recovery review, opt-in rather than a new CI browser journey.
test('capture save recovery copy', { tag: '@visual' }, async ({ page }) => {
  // eslint-disable-next-line playwright/no-skipped-test -- opt-in visual evidence
  test.skip(!out || process.env.MEDDIES_SAVE_CAPTURE !== '1', 'Set MEDDIES_SAVE_CAPTURE=1')
  test.setTimeout(120_000)
  await mkdir(resolve(out!), { recursive: true })
  await page.setViewportSize(captureCases.phone.viewport)
  await page.emulateMedia({ reducedMotion: captureCases.phone.reducedMotion })
  await page.goto(`/medications?medicine=${medicineId}&record=fix`)
  await expect(page.getByRole('heading', { name: 'Edit details' })).toBeVisible()
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
  await captureSettled(page, {
    path: resolve(out!, `save-offline-402.png`),
  })
  await page.context().setOffline(false)
  await page.goto(`/medications?medicine=${medicineId}&record=fix`)
  await expect(page.getByRole('heading', { name: 'Edit details' })).toBeVisible()
  await page.route('**/api/medicines', async (route) =>
    route.request().method() === 'PATCH'
      ? route.fulfill({
          status: 409,
          contentType: 'application/json',
          body: '{"error":"conflict"}',
        })
      : route.fallback(),
  )
  await page.getByRole('button', { name: 'Save details' }).click()
  await expect(
    page.getByRole('alert').filter({ hasText: /changed elsewhere|might not have saved/ }),
  ).toContainText('This medication changed elsewhere.')
  await page.getByRole('button', { name: 'Review saved medication' }).click({ trial: true })
  expect(await scrollsHorizontally(page)).toBe(false)
  await captureSettled(page, {
    path: resolve(out!, `save-conflict-402.png`),
  })
  await page.unroute('**/api/medicines')

  await page.route('**/api/medicines', async (route) =>
    route.request().method() === 'POST'
      ? route.fulfill({
          status: 409,
          contentType: 'application/json',
          body: '{"error":"conflict"}',
        })
      : route.fallback(),
  )
  await page.goto('/medications?add')
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.getByRole('textbox', { name: 'Name', exact: true }).fill('Conflicting medicine')
  await page.getByRole('textbox', { name: /^Strength/ }).fill('5 mg')
  await page.getByRole('combobox', { name: 'Type' }).click()
  await page.getByRole('option', { name: 'Capsule' }).click()
  await page.getByRole('button', { name: 'Save medication' }).click()
  await expect(page.getByRole('alert')).toContainText('A different version of this medication')
  await expect(page.getByRole('link', { name: "See what's saved" })).toBeVisible()
  expect(await scrollsHorizontally(page)).toBe(false)
  await captureSettled(page, {
    path: resolve(out!, 'add-conflict-402.png'),
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
  await captureSettled(page, {
    path: resolve(out!, `save-uncertain-402.png`),
  })
  await page.getByLabel(/^Amount/).fill('2')
  await expect(
    page.getByRole('alert').filter({ hasText: /changed elsewhere|might not have saved/ }),
  ).toContainText('Changing details starts a new save.')
  await page.getByRole('button', { name: 'Save as taken', exact: true }).click({ trial: true })
  await captureSettled(page, {
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
  await captureSettled(page, { path: resolve(out!, `save-skipped-402.png`) })
  await page.context().setOffline(false)

  async function captureDoseReceipt({
    name,
    path,
    open,
    save,
    receipt,
    motion = captureCases.phone.reducedMotion,
  }: {
    name: string
    path: string
    open: () => Promise<void>
    save: string
    receipt: string
    motion?: 'reduce' | 'no-preference'
  }) {
    await page.goto(path)
    await open()
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByRole('heading', { name: 'Capture Fixture Medicine' })).toBeVisible()
    await expect(dialog.getByLabel(/^Amount/)).toBeVisible()
    // Real motion, asserted before captureSettled finishes anything: the drawer opens to the
    // viewport bottom, and a short swipe springs back there keeping the draft.
    const popup = drawer(page)
    const viewportBottom = page.viewportSize()!.height
    const popupBottom = () => drawerBottom(page)
    await expect(popup).not.toHaveAttribute('data-starting-style')
    await expect.poll(popupBottom, { message: 'drawer opens fully' }).toBe(viewportBottom)
    const amount = await dialog.getByLabel(/^Amount/).inputValue()
    await dragHandle(page, 24)
    await expect(popup).toBeVisible()
    await expect(popup).not.toHaveAttribute('data-swiping')
    await expect(popup).not.toHaveAttribute('data-ending-style')
    await expect.poll(popupBottom, { message: 'short swipe springs back' }).toBe(viewportBottom)
    await expect(dialog.getByLabel(/^Amount/)).toHaveValue(amount)
    await dialog.getByRole('button', { name: save }).scrollIntoViewIfNeeded()
    await expect(dialog.getByRole('button', { name: save })).toBeVisible()
    expect(await scrollsHorizontally(page)).toBe(false)
    await captureSettled(page, { path: resolve(out!, `receipt-${name}-form-402.png`) })
    await page.emulateMedia({ reducedMotion: motion })
    await dialog.getByRole('button', { name: save }).click()
    await expect(drawer(page)).toHaveCount(0)
    await expect(toastMessage(page, receipt)).toBeVisible()
    // The Toast entry slides and fades, or only fades under reduced motion (#376).
    const transition = await toastTransitionProperties(toastMessage(page, receipt))
    expect(transition).toContain('opacity')
    expect(transition.includes('transform')).toBe(motion === 'no-preference')
    await expect(page.getByRole('region', { name: 'Notifications' })).toHaveAttribute(
      'aria-live',
      'polite',
    )
    await expect(toastMessage(page, receipt)).toBeVisible()
    await expect(page.getByRole('region', { name: 'Notifications' })).toHaveAttribute(
      'aria-live',
      'polite',
    )
    expect(await scrollsHorizontally(page)).toBe(false)
    await captureSettled(page, { path: resolve(out!, `receipt-${name}-402.png`) })
    await page.emulateMedia({ reducedMotion: captureCases.phone.reducedMotion })
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
    motion: 'reduce',
  })
})

// Opt-in read-recovery review, using the existing seeded screen-capture infrastructure.
test('capture read recovery copy', { tag: '@visual' }, async ({ page, app }) => {
  // eslint-disable-next-line playwright/no-skipped-test -- opt-in visual evidence
  test.skip(!out || process.env.MEDDIES_READ_CAPTURE !== '1', 'Set MEDDIES_READ_CAPTURE=1')
  test.setTimeout(180_000)
  await mkdir(resolve(out!), { recursive: true })
  await page.setViewportSize(captureCases.phone.viewport)
  const reads = [
    { method: 'POST', path: '/medicines', operation: 'list' },
    { method: 'POST', path: '/schedules', operation: 'listOutcomes' },
  ]
  const results: unknown[] = []
  async function capture(name: string) {
    await expect.poll(() => stylesheetsLoaded(page)).toBe(true)
    await expect.poll(() => scrollsHorizontally(page)).toBe(false)
    for (const action of await page.getByRole('button', { name: 'Try again', exact: true }).all()) {
      await action.scrollIntoViewIfNeeded()
      await expect(action).toBeVisible()
      await action.focus()
      await expect(action).toBeFocused()
    }
    await page.screenshot({
      path: resolve(out!, `read-${name}-402.png`),
      fullPage: true,
    })
    results.push({
      name,
      viewport: '402x874',
      outline: await page.getByRole('main').ariaSnapshot(),
    })
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

// Opt-in #329 deletion evidence, including real pointer dismissal and keyboard focus.
test(
  'capture medication deletion confirmation and result',
  { tag: '@visual' },
  async ({ page, app }) => {
    // eslint-disable-next-line playwright/no-skipped-test -- opt-in visual evidence
    test.skip(!out || process.env.MEDDIES_DELETE_CAPTURE !== '1', 'Set MEDDIES_DELETE_CAPTURE=1')
    await mkdir(resolve(out!), { recursive: true })
    await page.setViewportSize(captureCases.phone.viewport)
    const id = '00000000-0000-4000-8000-0000000d0329'
    await app.api('POST', '/api/medicines', {
      id,
      label: 'Vitamin D',
      strength: '',
      unit: 'tablet',
    })
    await page.goto(`/medications?medicine=${id}&manage`)
    const action = page.getByRole('button', { name: 'Delete medication' })
    const confirmation = page.getByRole('dialog', { name: 'Delete Vitamin D?' })
    await openConfirmationWithMotion(page, action)
    await expect(page.getByRole('heading', { name: 'Delete Vitamin D?' })).toBeFocused()
    await dragHandle(page, 260)
    await expect(confirmation).toBeHidden()
    await expect(action).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(confirmation).toBeVisible()
    await page.keyboard.press('Tab')
    await expect(page.getByRole('button', { name: 'Close' })).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(action).toBeFocused()
    await expect.poll(() => scrollsHorizontally(page)).toBe(false)
    await page.screenshot({
      path: resolve(out!, 'delete-confirmation-402.png'),
      fullPage: true,
      animations: 'disabled',
    })
    const deletion = { method: 'POST', path: '/medicines', operation: 'delete' }
    app.worker.hold(deletion)
    await page.keyboard.press('Enter')
    await expect(page.getByRole('button', { name: 'Deleting...' })).toBeDisabled()
    await page.keyboard.press('Escape')
    await dragHandle(page, 260)
    await expect(confirmation).toBeVisible()
    app.worker.release(deletion)
    await expect(page).toHaveURL(`${app.origin}/medications`)
    await expect(toastMessage(page, 'Vitamin D deleted')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Medications', exact: true })).toBeFocused()
    await expect(page.getByRole('link', { name: 'View details for Vitamin D' })).toHaveCount(0)
    await expect.poll(() => scrollsHorizontally(page)).toBe(false)
    await page.screenshot({ path: resolve(out!, 'delete-result-402.png'), fullPage: true })
  },
)

// Opt-in #377 evidence: at 320px a long label's confirmation Toast wraps and keeps its
// 44px Dismiss, with no horizontal overflow.
test(
  'capture a long label confirmation Toast at 320px',
  { tag: '@visual' },
  async ({ page, app }) => {
    // eslint-disable-next-line playwright/no-skipped-test -- opt-in visual evidence
    test.skip(!out || process.env.MEDDIES_TOAST_CAPTURE !== '1', 'Set MEDDIES_TOAST_CAPTURE=1')
    await mkdir(resolve(out!), { recursive: true })
    await page.setViewportSize({ width: 320, height: 693 })
    const id = '00000000-0000-4000-8000-0000000d0377'
    const label = 'Amoxicillin with clavulanic acid oral suspension'
    await app.api('POST', '/api/medicines', { id, label, strength: '', unit: 'tablet' })
    await page.goto(`/medications?medicine=${id}&manage`)
    await page.getByRole('button', { name: 'Delete medication' }).click()
    await page
      .getByRole('dialog', { name: `Delete ${label}?` })
      .getByRole('button', { name: 'Delete medication' })
      .click()
    await expect(page).toHaveURL(`${app.origin}/medications`)
    const title = toastMessage(page, `${label} deleted`)
    await expect(title).toBeVisible()
    // Base UI shows Dismiss once pointer or focus expands the stack.
    await title.hover()
    const dismiss = page
      .getByRole('region', { name: 'Notifications' })
      .getByRole('button', { name: 'Dismiss' })
    await expect(dismiss).toBeVisible()
    const target = (await dismiss.boundingBox())!
    expect([target.width, target.height]).toEqual([44, 44])
    // The label wraps: one line of the title is about 20px tall.
    expect((await title.boundingBox())!.height).toBeGreaterThan(30)
    expect(await scrollsHorizontally(page)).toBe(false)
    await captureSettled(page, { path: resolve(out!, 'toast-long-label-320.png') })
  },
)

// Opt-in #378 evidence: two confirmations collapse with the older peeking behind, scaled
// (371·A8), and hovering fans them out, each with its own Dismiss (371·A9).
test('capture two stacked confirmation Toasts', { tag: '@visual' }, async ({ page, app }) => {
  // eslint-disable-next-line playwright/no-skipped-test -- opt-in visual evidence
  test.skip(!out || process.env.MEDDIES_TOAST_CAPTURE !== '1', 'Set MEDDIES_TOAST_CAPTURE=1')
  await mkdir(resolve(out!), { recursive: true })
  await page.setViewportSize({ width: 402, height: 874 })
  const medicines = [
    { id: '00000000-0000-4000-8000-0000000d0378', label: 'Vitamin D' },
    { id: '00000000-0000-4000-8000-0000000e0378', label: 'Magnesium' },
  ]
  for (const { id, label } of medicines) {
    await app.api('POST', '/api/medicines', { id, label, strength: '', unit: 'tablet' })
  }
  const remove = async ({ id, label }: (typeof medicines)[number]) => {
    // By id: the closing confirmation drawer still holds its own Delete medication. Enter, as
    // the first Toast covers the button.
    await page.locator(`#delete-medicine-${id}`).press('Enter')
    await page
      .getByRole('dialog', { name: `Delete ${label}?` })
      .getByRole('button', { name: 'Delete medication' })
      .click()
    await expect(toastMessage(page, `${label} deleted`)).toBeVisible()
  }
  await page.goto(`/medications?medicine=${medicines[0]!.id}`)
  await remove(medicines[0]!)
  // In-app navigation keeps the first Toast; a page load would drop it.
  await page.getByRole('link', { name: /Magnesium/ }).click()
  await remove(medicines[1]!)
  const region = page.getByRole('region', { name: 'Notifications' })
  await captureSettled(page, { path: resolve(out!, 'toast-stack-collapsed-402.png') })
  await toastMessage(page, 'Magnesium deleted').hover()
  await expect(region.getByRole('button', { name: 'Dismiss' })).toHaveCount(2)
  await captureSettled(page, { path: resolve(out!, 'toast-stack-expanded-402.png') })
})

// Opt-in #327 archive evidence, including real pointer dismissal and keyboard focus.
test(
  'capture medication archive confirmation and result',
  { tag: '@visual' },
  async ({ page, app }) => {
    // eslint-disable-next-line playwright/no-skipped-test -- opt-in visual evidence
    test.skip(!out || process.env.MEDDIES_ARCHIVE_CAPTURE !== '1', 'Set MEDDIES_ARCHIVE_CAPTURE=1')
    await mkdir(resolve(out!), { recursive: true })
    await page.setViewportSize(captureCases.phone.viewport)
    const id = '00000000-0000-4000-8000-0000000a0327'
    await app.api('POST', '/api/medicines', {
      id,
      label: 'Magnesium',
      strength: '400 mg',
      unit: 'tablet',
    })
    await app.api('POST', '/api/schedules', {
      id: '00000000-0000-4000-8000-0000000b0327',
      medicineId: id,
      startDate: today,
      times: [{ time: '20:00', quantity: 1 }],
    })
    await page.goto(`/medications?medicine=${id}&manage`)
    const action = page.getByRole('button', { name: 'Archive medication' })
    const confirmation = page.getByRole('dialog', { name: 'Archive Magnesium?' })
    await openConfirmationWithMotion(page, action)
    await expect(page.getByRole('heading', { name: 'Archive Magnesium?' })).toBeFocused()
    await dragHandle(page, 260)
    await expect(confirmation).toBeHidden()
    await expect(action).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(confirmation).toBeVisible()
    await page.keyboard.press('Tab')
    await expect(page.getByRole('button', { name: 'Close' })).toBeFocused()
    await page.keyboard.press('Tab')
    const submit = confirmation.getByRole('button', { name: 'Archive medication' })
    await expect(submit).toBeFocused()
    await expect.poll(() => scrollsHorizontally(page)).toBe(false)
    await page.screenshot({
      path: resolve(out!, 'archive-confirmation-402.png'),
      fullPage: true,
      animations: 'disabled',
    })
    const archive = { method: 'POST', path: '/medicines', operation: 'archive' }
    app.worker.hold(archive)
    await page.keyboard.press('Enter')
    await expect(page.getByRole('button', { name: 'Archiving...' })).toBeDisabled()
    await page.keyboard.press('Escape')
    await dragHandle(page, 260)
    await expect(confirmation).toBeVisible()
    app.worker.release(archive)
    await expect(confirmation).toBeHidden()
    await expect(page).toHaveURL(`${app.origin}/medications?medicine=${id}`)
    await expect(page.getByText('Kept in History')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Magnesium', exact: true })).toBeFocused()
    await expect.poll(() => scrollsHorizontally(page)).toBe(false)
    await page.screenshot({ path: resolve(out!, 'archive-result-402.png'), fullPage: true })
  },
)

// Opt-in #328 restore evidence (292·S8, 292·S9), including real pointer dismissal and keyboard focus.
test(
  'capture medication restore confirmation and result',
  { tag: '@visual' },
  async ({ page, app }) => {
    // eslint-disable-next-line playwright/no-skipped-test -- opt-in visual evidence
    test.skip(!out || process.env.MEDDIES_RESTORE_CAPTURE !== '1', 'Set MEDDIES_RESTORE_CAPTURE=1')
    await mkdir(resolve(out!), { recursive: true })
    await page.setViewportSize(captureCases.phone.viewport)
    const id = '00000000-0000-4000-8000-0000000a0328'
    await app.api('POST', '/api/medicines', {
      id,
      label: 'Magnesium',
      strength: '400 mg',
      unit: 'tablet',
    })
    await app.api('POST', '/api/schedules', {
      id: '00000000-0000-4000-8000-0000000b0328',
      medicineId: id,
      startDate: today,
      times: [{ time: '20:00', quantity: 1 }],
    })
    await page.goto('/medications')
    expect(await archiveMedicine(page, id)).toMatch(/^200 /)
    await page.goto(`/medications?medicine=${id}`)
    const action = page.getByRole('button', { name: 'Restore medication' })
    const confirmation = page.getByRole('dialog', { name: 'Restore Magnesium?' })
    await openConfirmationWithMotion(page, action)
    await expect(page.getByRole('heading', { name: 'Restore Magnesium?' })).toBeFocused()
    await dragHandle(page, 260)
    await expect(confirmation).toBeHidden()
    await expect(action).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(confirmation).toBeVisible()
    await page.keyboard.press('Tab')
    await expect(page.getByRole('button', { name: 'Close' })).toBeFocused()
    await page.keyboard.press('Tab')
    const submit = confirmation.getByRole('button', { name: 'Restore medication' })
    await expect(submit).toBeFocused()
    await expect.poll(() => scrollsHorizontally(page)).toBe(false)
    await page.screenshot({
      path: resolve(out!, 'restore-confirmation-402.png'),
      fullPage: true,
      animations: 'disabled',
    })
    const restore = { method: 'POST', path: '/medicines', operation: 'restore' }
    app.worker.hold(restore)
    await page.keyboard.press('Enter')
    await expect(page.getByRole('button', { name: 'Restoring...' })).toBeDisabled()
    await page.keyboard.press('Escape')
    await dragHandle(page, 260)
    await expect(confirmation).toBeVisible()
    app.worker.release(restore)
    await expect(confirmation).toBeHidden()
    await expect(page).toHaveURL(`${app.origin}/medications?medicine=${id}`)
    await expect(page.getByText('Magnesium restored', { exact: true })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Magnesium', exact: true })).toBeFocused()
    // Keyboard order on the restored detail: Log a dose leads, Set schedule follows.
    const logDose = page.getByRole('button', { name: 'Log a dose' })
    await logDose.focus()
    await page.keyboard.press('Tab')
    await expect(page.getByRole('link', { name: 'Set schedule' })).toBeFocused()
    await page.getByRole('heading', { name: 'Magnesium', exact: true }).focus()
    await expect.poll(() => scrollsHorizontally(page)).toBe(false)
    await page.screenshot({ path: resolve(out!, 'restore-result-402.png'), fullPage: true })
  },
)

// Opt-in #402 visual evidence, never a CI journey.
test('capture Add medicine row focus', { tag: '@visual' }, async ({ page }) => {
  // eslint-disable-next-line playwright/no-skipped-test -- opt-in visual evidence
  test.skip(
    process.env.MEDDIES_FOCUS_CAPTURE !== '1' || !out,
    'Set MEDDIES_FOCUS_CAPTURE and MEDDIES_VISUAL_OUT',
  )
  test.setTimeout(120_000)
  await mkdir(resolve(out!), { recursive: true })
  await page.goto('/medications?add')
  const name = page.getByRole('textbox', { name: 'Name', exact: true })
  const strength = page.getByRole('textbox', { name: 'Strength', exact: true })
  const stock = page.getByRole('textbox', { name: 'Stock', exact: true })
  await expect(name).toBeVisible()
  await expect(loadingStatus(page)).toHaveCount(0)
  await page.addStyleTag({ content: 'nextjs-portal { display: none; }' })
  await page.getByRole('combobox', { name: 'Type', exact: true }).click()
  await page.getByRole('option', { name: 'Tablet', exact: true }).click()
  const captureRows = async (state: string) => {
    for (const [label, control] of [
      ['name', name],
      ['strength', strength],
      ['stock', stock],
    ] as const) {
      await control.press('Tab')
      await page.keyboard.press('Shift+Tab')
      await expect(control).toBeFocused()
      await captureSettled(page, { path: resolve(out!, `add-focus-${state}-${label}-402.png`) })
      expect(await scrollsHorizontally(page)).toBe(false)
    }
  }
  await captureRows('help')
  await strength.fill('x'.repeat(121))
  await stock.fill('-1')
  await page.getByRole('button', { name: 'Save medication', exact: true }).click()
  await expect(name).toBeFocused()
  await expect(page.getByText('Enter the medication name.', { exact: true })).toBeVisible()
  await expect(page.getByText('Use 120 characters or fewer.', { exact: true })).toBeVisible()
  await expect(stock).toHaveAttribute('aria-invalid', 'true')
  await captureRows('error')
})
