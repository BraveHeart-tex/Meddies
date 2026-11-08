import { test, expect } from './fixtures'
import { scrollsHorizontally, trackSignInAnnouncements, signInAnnouncements } from './actions'

// Auth is synthetic; the Google response is replaced only after observing the submitted target.
test.use({
  journey: { auth: true, storage: true, initialScheduleTime: '2035-06-15T12:00:00+03:00' },
})

for (const destination of [
  '/history?date=2035-06-14',
  '/medications',
  '/medications?add',
  '/medications?medicine=c0c22213-a56e-42f5-859b-1d5ba320c036',
  '/medications?schedule=c0c22213-a56e-42f5-859b-1d5ba320c036',
  '/settings',
]) {
  test(`signed-out entry replaces history and returns to ${destination}`, async ({
    page,
    context,
    app,
  }) => {
    const cookies = await context.cookies()
    await context.clearCookies()
    await page.goto('/not-a-page')
    await page.goto(destination)
    await expect(page).toHaveURL(`${app.origin}/?returnTo=${encodeURIComponent(destination)}`)
    await expect(page.getByRole('heading', { name: 'Sign in', exact: true })).toBeVisible()
    await page.goBack()
    await expect(page).toHaveURL(`${app.origin}/not-a-page`)
    await page.goForward()
    await page.route('**/api/auth/signin/google*', async (route) => {
      expect(new URLSearchParams(route.request().postData()!).get('callbackUrl')).toBe(destination)
      await context.addCookies(cookies)
      await route.fulfill({ json: { url: `${app.origin}${destination}` } })
    })
    await page.getByRole('button', { name: 'Continue with Google' }).click()
    await expect(page).toHaveURL(`${app.origin}${destination}`)
    await expect(page.getByRole('heading', { level: 1 })).toBeFocused()
    await page.goBack()
    await expect(page).toHaveURL(`${app.origin}/not-a-page`)
  })
}

test('restricted retry keeps the Auth.js callback destination and requests the chooser', async ({
  page,
  context,
  app,
}) => {
  await context.clearCookies()
  const destination = '/history?date=2035-06-14'
  await page.goto(`/?returnTo=${encodeURIComponent(destination)}`)
  await page.route('https://accounts.google.com/**', (route) => {
    expect(new URL(route.request().url()).searchParams.get('prompt')).toBe('select_account')
    return route.fulfill({ contentType: 'text/html', body: '<h1>Synthetic Google</h1>' })
  })
  await page.getByRole('button', { name: 'Continue with Google' }).click()
  await expect(page.getByRole('heading', { name: 'Synthetic Google' })).toBeVisible()
  await page.goto('/api/auth/error?error=AccessDenied')
  await expect(page.getByRole('button', { name: 'Choose another Google account' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Sign in', exact: true })).toBeFocused()
  await page.route('**/api/auth/signin/google*', async (route) => {
    expect(new URLSearchParams(route.request().postData()!).get('callbackUrl')).toBe(destination)
    await route.fallback()
  })
  await page.getByRole('button', { name: 'Choose another Google account' }).click()
  await expect(page.getByRole('heading', { name: 'Synthetic Google' })).toBeVisible()
  expect(page.url()).not.toContain(app.origin)
})

for (const reason of ['expired', 'signed-out']) {
  test(`reason ${reason} focuses heading and has one polite announcement`, async ({
    page,
    context,
  }) => {
    await context.clearCookies()
    await page.goto(`/?reason=${reason}`)
    const heading = page.getByRole('heading', { name: 'Sign in', exact: true })
    await expect(heading).toBeFocused()
    const status = page.getByRole('status')
    await expect(status).toHaveCount(1)
    await expect(status).toHaveAttribute('aria-atomic', 'true')
    await expect(status).toContainText(
      reason === 'expired' ? 'Your session ended.' : "You're signed out",
    )
    await expect(page.getByRole('main').getByRole('alert')).toHaveCount(0)
    await expect(heading).not.toHaveAttribute('aria-describedby')
    await page.keyboard.press('Tab')
    await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeFocused()
    expect(await scrollsHorizontally(page)).toBe(false)
  })
}
