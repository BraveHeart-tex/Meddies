import { expect, test } from './fixtures'
import { clearFocus, focusRing, rowHeadingFocus, trackRowHeadingFocus } from './actions'
import { doseTrigger, drawer, toastMessage } from './locators'
import { addDays, insertScheduledMedicine } from './seed'
import type { WorkerRoute } from './worker-proxy'

// FE-718: focus moved by script stays on headings and titles without looking like a control.
const initialScheduleTime = '2035-06-15T09:00:00+03:00'
const today = initialScheduleTime.slice(0, 10)
const label = 'Focus Fixture Medicine'

test.use({
  journey: {
    auth: true,
    storage: true,
    initialScheduleTime,
    seed: ({ db, ownerId }) =>
      insertScheduledMedicine(db, ownerId, {
        label,
        startDate: addDays(today, -3),
        times: [{ time: '09:01', quantity: 1 }],
      }),
  },
})

// Matching :focus-visible keeps these from passing only because the browser drew no ring at all.
const noRing = { focusVisible: true, outline: 'none' }
const solidRing = { focusVisible: true, outline: 'solid' }

// Reuse interactions; only the on-request group asserts appearance.
function focusScenarios(checkRing: (actual: unknown, expected: unknown) => void) {
  for (const { path, role, name } of [
    { path: '/', role: 'link', name: 'Settings' },
    { path: '/history', role: 'link', name: 'Settings' },
    { path: '/medications', role: 'link', name: 'Add a medication' },
    { path: '/settings', role: 'button', name: 'Sign out' },
  ] as const) {
    test(`first load of ${path} focuses the page title`, async ({ page }) => {
      await page.goto(path)
      const title = page.getByRole('heading', { level: 1 })
      await expect(title).toBeFocused()
      checkRing(await focusRing(title), noRing)
      await page.keyboard.press('Tab')
      const control = page.getByRole(role, { name })
      await expect(control).toBeFocused()
      checkRing(await focusRing(control), solidRing)
    })
  }

  test('the sign-in heading stays focused after a reason or error', async ({ page, context }) => {
    await context.clearCookies()
    const heading = page.getByRole('heading', { name: 'Good to see you', exact: true })
    await page.goto('/?reason=expired')
    await expect(heading).toBeFocused()
    checkRing(await focusRing(heading), noRing)
    await page.keyboard.press('Tab')
    const google = page.getByRole('button', { name: 'Continue with Google' })
    await expect(google).toBeFocused()
    checkRing(await focusRing(google), solidRing)
    await page.goto('/api/auth/error?error=AccessDenied')
    await expect(page.getByRole('button', { name: 'Choose another Google account' })).toBeVisible()
    await expect(heading).toBeFocused()
    checkRing(await focusRing(heading), noRing)
  })

  test('a Today row heading takes focus after a dose outcome', async ({ page, app }) => {
    const write: WorkerRoute = {
      method: 'POST',
      path: '/schedules',
      operation: 'recordSkipped',
    }
    const dialog = drawer(page)
    await page.goto('/')
    await trackRowHeadingFocus(page)
    await doseTrigger(page, label).press('Enter')
    await dialog.getByRole('button', { name: 'I skipped it' }).press('Enter')
    app.worker.hold(write)
    await dialog.getByRole('button', { name: 'Save as skipped' }).press('Enter')
    await expect.poll(() => app.worker.held(write)).toBe(1)
    // The outcome moves focus to the heading only when nothing else holds it.
    await clearFocus(page)
    app.worker.release(write)
    await expect(toastMessage(page, `${label} 09:01 · saved as skipped`)).toBeVisible()
    await expect.poll(() => rowHeadingFocus(page)).toBeTruthy()
    checkRing(await rowHeadingFocus(page), noRing)
  })

  test('the History day title stays focused when the day fails to load', async ({ page, app }) => {
    await page.goto('/history')
    await expect(page.getByText('Nothing due yet today')).toBeVisible()
    app.worker.fail({ method: 'POST', path: '/schedules', operation: 'listOutcomes' }, 503)
    await page.getByRole('button', { name: 'Previous day' }).press('Enter')
    const dayTitle = page.getByText(/^History for .* didn't load just now\.$/)
    await expect(dayTitle).toBeFocused()
    checkRing(await focusRing(dayTitle), noRing)
  })
}

test.describe('script focus', () => {
  focusScenarios(() => {})
})

function expectRing(actual: unknown, expected: unknown) {
  expect(actual).toEqual(expected)
}

test.describe('focus appearance', { tag: '@visual' }, () => {
  focusScenarios(expectRing)
})
