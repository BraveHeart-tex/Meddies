import { forceTodayRenderError, restoreTodayRendering, waitForClientRouter } from './actions'
import { expect, test } from './fixtures'
import { selectedNavigation } from './locators'

test.describe('unknown address', () => {
  test.use({ journey: { auth: true, storage: true } })

  // Allowed reason: navigation from the public recovery page with real session cookies.
  test('unknown address offers Today signed in and signed out', async ({ page, context }) => {
    const cookies = await context.cookies()
    for (const { title, session, heading } of [
      { title: 'signed in', session: cookies, heading: /Good / },
      { title: 'signed out', session: [], heading: 'Good to see you' },
    ]) {
      await context.clearCookies()
      await context.addCookies(session)

      await test.step(title, async () => {
        const response = await page.goto('/unknown-fe677-address')
        expect(response?.status()).toBe(404)
        await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible()
        await expect(page.getByRole('main').getByRole('alert')).toContainText(
          "This page isn't in Meddies.",
        )
        await expect(page.getByRole('main').getByRole('alert')).toContainText(
          "The link may be old or mistyped. Your records haven't changed.",
        )
        await expect(selectedNavigation(page)).toHaveCount(0)
        await expect(page.getByRole('navigation', { name: 'Primary' })).toHaveCount(
          session.length ? 1 : 0,
        )
        // Both sessions have exactly the same public content; extra private text fails.
        await expect(page.getByRole('main')).toHaveText(
          /^Page not found\s*This page isn't in Meddies\.\s*The link may be old or mistyped\. Your records haven't changed\.\s*Open Today$/,
        )
        await waitForClientRouter(page)
        await page.getByRole('link', { name: 'Open Today' }).click()
        await expect(page).toHaveURL('/')
        await expect(page.getByRole('heading', { name: 'Page not found' })).toHaveCount(0)
        await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible()
      })
    }
  })
})

test.describe('render recovery', () => {
  test.use({
    journey: { auth: true, storage: true, initialScheduleTime: '2035-06-15T09:00:00+03:00' },
  })

  test('a forced render error keeps navigation and retries successfully', async ({ page }) => {
    await forceTodayRenderError(page)
    await page.goto('/')
    await expect(page.getByRole('main').getByRole('alert')).toContainText(
      "This page couldn't open.",
    )
    await expect(page.getByRole('main').getByRole('alert')).toContainText(
      "Your records haven't changed.",
    )
    await expect(page.getByRole('navigation', { name: 'Primary' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Open Today' })).toBeVisible()
    await expect(page.getByText(/sign.in/i)).toHaveCount(0)
    await restoreTodayRendering(page)
    await page.getByRole('button', { name: 'Try again' }).click()
    await expect(page.getByRole('heading', { name: 'Good morning' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Try again' })).toHaveCount(0)
    await expect(page.getByRole('navigation', { name: 'Primary' })).toBeVisible()
  })
})
