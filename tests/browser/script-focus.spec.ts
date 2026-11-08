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

for (const { path, firstLink } of [
  { path: '/', firstLink: 'Settings' },
  { path: '/history', firstLink: 'Settings' },
  { path: '/medications', firstLink: 'Add a medication' },
  { path: '/settings', firstLink: 'Settings' },
]) {
  test(`first load of ${path} focuses the page title without an outline`, async ({ page }) => {
    await page.goto(path)
    const title = page.getByRole('heading', { level: 1 })
    await expect(title).toBeFocused()
    expect(await focusRing(title)).toEqual(noRing)
    await page.keyboard.press('Tab')
    const link = page.getByRole('link', { name: firstLink })
    await expect(link).toBeFocused()
    expect(await focusRing(link)).toEqual(solidRing)
  })
}

test('the sign-in heading stays focused after a reason or error, without an outline', async ({
  page,
  context,
}) => {
  await context.clearCookies()
  const heading = page.getByRole('heading', { name: 'Sign in', exact: true })
  await page.goto('/?reason=expired')
  await expect(heading).toBeFocused()
  expect(await focusRing(heading)).toEqual(noRing)
  await page.keyboard.press('Tab')
  const google = page.getByRole('button', { name: 'Continue with Google' })
  await expect(google).toBeFocused()
  expect(await focusRing(google)).toEqual(solidRing)
  await page.goto('/api/auth/error?error=AccessDenied')
  await expect(page.getByRole('button', { name: 'Choose another Google account' })).toBeVisible()
  await expect(heading).toBeFocused()
  expect(await focusRing(heading)).toEqual(noRing)
})

test('a Today row heading shows no outline when a dose outcome focuses it', async ({
  page,
  app,
}) => {
  const write: WorkerRoute = { method: 'POST', path: '/schedules', operation: 'recordSkipped' }
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
  expect(await rowHeadingFocus(page)).toEqual(noRing)
})

test('the History day title stays focused without an outline when the day fails to load', async ({
  page,
  app,
}) => {
  await page.goto('/history')
  await expect(page.getByText('Nothing was due before now today.')).toBeVisible()
  app.worker.fail({ method: 'POST', path: '/schedules', operation: 'listOutcomes' }, 503)
  await page.getByRole('button', { name: 'Previous day' }).press('Enter')
  const dayTitle = page.getByText(/^History for .* didn't load just now\.$/)
  await expect(dayTitle).toBeFocused()
  expect(await focusRing(dayTitle)).toEqual(noRing)
})
