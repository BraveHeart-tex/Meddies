import { expect, test } from './fixtures'
import { insertScheduledMedicine } from './seed'
import { enlargeText, scrollsHorizontally, scrollPosition, waitForClientRouter } from './actions'

test.use({
  journey: {
    auth: true,
    storage: true,
    initialScheduleTime: '2035-06-15T12:00:00+03:00',
    seed: ({ db, ownerId }) =>
      insertScheduledMedicine(db, ownerId, {
        label: 'History navigation fixture',
        startDate: '2035-06-01',
        times: Array.from({ length: 20 }, (_, hour) => ({
          time: `${String(hour).padStart(2, '0')}:00`,
          quantity: 1,
        })),
      }),
  },
})

test('Settings checks session end before showing the signed-out destination and removes private views', async ({
  page,
  app,
}) => {
  await page.goto('/medications')
  await page.getByRole('link', { name: 'Add a medication' }).click()
  await page.getByLabel('Name', { exact: true }).fill('Private draft')
  await page.goBack()
  await page.getByRole('link', { name: 'Settings' }).click()
  await expect(page.getByText('Approved', { exact: true })).toBeVisible()
  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  await page.route('**/api/session', async (route) => {
    await gate
    await route.fallback()
  })
  await page.getByRole('button', { name: 'Sign out', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Signing out…' })).toBeDisabled()
  await expect(page).toHaveURL(`${app.origin}/settings`)
  release()
  await expect(page).toHaveURL(`${app.origin}/?reason=signed-out&returnTo=%2Fsettings`)
  await expect(
    page.getByText("You're signed out of Meddies in this browser.", { exact: true }),
  ).toBeVisible()
  await page.goBack()
  await expect(page.getByText('Private draft', { exact: true })).toHaveCount(0)
  expect((await page.request.get('/api/session')).status()).toBe(401)
})

test('Settings leaves nav unselected and browser Back restores the History date', async ({
  page,
  app,
}) => {
  await page.goto('/history?date=2035-06-14')
  await waitForClientRouter(page)
  await expect(page.getByText('History navigation fixture').first()).toBeVisible()
  await page.getByRole('link', { name: 'Settings' }).focus()
  await page.mouse.wheel(0, 650)
  await expect.poll(() => scrollPosition(page)).toBeGreaterThan(0)
  const before = await scrollPosition(page)
  // Activate the focused header link without scrolling it into view first.
  await page.keyboard.press('Enter')
  await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Settings' })).toHaveCount(0)
  for (const name of ['Today', 'Medications', 'History']) {
    await expect(
      page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name }),
    ).not.toHaveAttribute('aria-current')
  }
  await expect(page.getByRole('link', { name: /Back/ })).toHaveCount(0)
  await page.goBack()
  await expect(page).toHaveURL(`${app.origin}/history?date=2035-06-14`)
  await expect.poll(() => scrollPosition(page)).toBe(before)
})

test('Settings visual review at 402px, 320px and synthetic 200% text @visual', async ({
  page,
  context,
}) => {
  await page.goto('/settings')
  await expect(page.getByRole('heading', { name: 'Account' })).toBeVisible()
  const button = page.getByRole('button', { name: /^(Sign out|Try signing out again)$/ })
  await button.focus()
  await expect(button).toBeFocused()
  await page.screenshot({ path: '/tmp/fe676-402.png', fullPage: true })
  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  await page.route('**/api/auth/signout', async (route) => {
    await gate
    await route.fulfill({ status: 403, json: {} })
  })
  await button.press('Enter')
  await expect(page.getByRole('button', { name: 'Signing out…' })).toBeDisabled()
  await page.screenshot({ path: '/tmp/fe676-pending.png', fullPage: true })
  release()
  await expect(page.getByRole('main').getByRole('alert')).toContainText("You're still signed in")
  await page.screenshot({ path: '/tmp/fe676-recovery.png', fullPage: true })
  await page.setViewportSize({ width: 320, height: 740 })
  await expect(button).toBeVisible()
  await page.screenshot({ path: '/tmp/fe676-320.png', fullPage: true })
  await context.setOffline(true)
  await expect(page.getByRole('button', { name: 'Connect to sign out' })).toBeDisabled()
  await page.screenshot({ path: '/tmp/fe676-offline.png', fullPage: true })
  await context.setOffline(false)
  await enlargeText(page)
  await button.scrollIntoViewIfNeeded()
  await expect(button).toBeVisible()
  expect(await scrollsHorizontally(page)).toBe(false)
  await page.screenshot({ path: '/tmp/fe676-text.png', fullPage: true })
})
