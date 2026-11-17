import { expect, test } from './fixtures'
import { clearFocus, focusRing, rowHeadingFocus, trackRowHeadingFocus } from './actions'
import { doseTrigger, drawer, toastMessage } from './locators'
import { countApiRequests } from './requests'
import { insertScheduledMedicine } from './seed'
import { reminderLink } from '../../src/features/schedules/reminder-link'
import type { WorkerRoute } from './worker-proxy'

// #168: focus moved by script stays on headings and titles without looking like a control.
const initialScheduleTime = '2035-06-15T09:00:00+03:00'
const today = initialScheduleTime.slice(0, 10)
const label = 'Focus Fixture Medicine'
const scheduleId = '6f1d3c52-8a0e-4d6b-9c1a-3e2f4b5a6c7d'

test.use({
  journey: {
    auth: true,
    storage: true,
    initialScheduleTime,
    seed: ({ db, ownerId }) =>
      insertScheduledMedicine(db, ownerId, {
        label,
        scheduleId,
        // Starts today, so To log has no dose from yesterday (#275) and Today has one row.
        startDate: today,
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
    { path: '/', role: 'button', name: `I took it, ${label} at 09:01` },
    { path: '/history', role: 'button', name: 'Previous day' },
    { path: '/medications', role: 'link', name: 'Add a medication' },
    // Quiet hours' switch (#381) comes before Sign out once its saved value loads.
    { path: '/settings', role: 'switch', name: 'Quiet hours on all your devices' },
  ] as const) {
    test(`first load of ${path} focuses the page title`, async ({ page }) => {
      await page.goto(path)
      const title = page.getByRole('heading', { level: 1 })
      await expect(title).toBeFocused()
      checkRing(await focusRing(title), noRing)
      // Each page's first control can arrive after the title, as Today's doses do.
      const control = page.getByRole(role, { name })
      await expect(control).toBeVisible()
      await expect(title).toBeFocused()
      await page.keyboard.press('Tab')
      await expect(control).toBeFocused()
      checkRing(await focusRing(control), solidRing)
    })
  }

  test('the sign-in heading stays focused after a reason or error', async ({ page, context }) => {
    await context.clearCookies()
    const heading = page.getByRole('heading', { name: 'Sign in to Meddies', exact: true })
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
    await expect(toastMessage(page, `${label} 09:01 · Skipped`)).toBeVisible()
    await expect.poll(() => rowHeadingFocus(page)).toBeTruthy()
    checkRing(await rowHeadingFocus(page), noRing)
  })

  test('the History day title stays focused when the day fails to load', async ({ page, app }) => {
    await page.goto('/history')
    await expect(page.getByRole('heading', { level: 1, name: 'History' })).toBeFocused()
    await expect(page.getByText('Nothing due yet today')).toBeVisible()
    app.worker.fail({ method: 'POST', path: '/schedules', operation: 'listOutcomes' }, 503)
    await page.getByRole('button', { name: 'Previous day' }).press('Enter')
    const dayTitle = page.getByText(/^Couldn’t load History for .*\.$/)
    await expect(dayTitle).toBeFocused()
    checkRing(await focusRing(dayTitle), noRing)
    await page.keyboard.press('Tab')
    await expect(page.getByRole('button', { name: 'Try again' })).toBeFocused()
  })
}

test.describe('script focus', () => {
  focusScenarios(() => {})

  // #367: focus moved by script after hydration, and Back, Forward or reload behavior.
  test('a Reminder link opens its dose drawer once', async ({ page, app }) => {
    const dialog = drawer(page)
    await page.goto('/settings')
    // Settings reads Quiet hours in the browser (#381); count only after that read lands.
    await expect(
      page.getByRole('switch', { name: 'Quiet hours on all your devices' }),
    ).toBeVisible()
    const api = countApiRequests(page, app.origin)
    await page.goto(reminderLink({ scheduleId, dueAt: `${today}T09:01:00+03:00` }))
    await expect(dialog).toBeVisible()
    // The drawer's title takes initial focus, as when a row opens it.
    await expect(dialog.getByRole('heading', { name: label })).toBeFocused()
    // The link is cleared in place: no router navigation, so no browser read either.
    await expect(page).toHaveURL(`${app.origin}/`)
    expect(api.counts()).toEqual({})
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
    await expect(doseTrigger(page, label)).toBeFocused()

    await page.reload()
    await expect(doseTrigger(page, label)).toBeVisible()
    await expect(page.getByRole('heading', { level: 1 })).toBeFocused()
    await expect(dialog).toBeHidden()
    await page.goBack()
    await expect(page).toHaveURL(`${app.origin}/settings`)
    await page.goForward()
    await expect(page).toHaveURL(`${app.origin}/`)
    await expect(doseTrigger(page, label)).toBeVisible()
    await expect(dialog).toBeHidden()
  })
})

function expectRing(actual: unknown, expected: unknown) {
  expect(actual).toEqual(expected)
}

test.describe('focus appearance', { tag: '@visual' }, () => {
  focusScenarios(expectRing)
})
