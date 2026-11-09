import { test, expect } from './fixtures'

// Auth is synthetic; the Google response is replaced only after observing the submitted target.
test.use({
  journey: { auth: true, storage: true, initialScheduleTime: '2035-06-15T12:00:00+03:00' },
})

// Allowed reason: Back/Forward and history replacement through the sign-in round trip.
test('signed-out entry replaces history and returns to History', async ({ page, context, app }) => {
  const destination = '/history?date=2035-06-14'
  const cookies = await context.cookies()
  await context.clearCookies()
  await page.goto('/not-a-page')
  await page.goto(destination)
  await expect(page).toHaveURL(`${app.origin}/?returnTo=${encodeURIComponent(destination)}`)
  await expect(page.getByRole('heading', { name: 'Good to see you', exact: true })).toBeVisible()
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

// Allowed reason: server-to-browser redirect handoff for the other guarded routes.
test('signed-out entry guards Medications and Settings', async ({ page, context, app }) => {
  await context.clearCookies()
  for (const destination of ['/medications', '/settings']) {
    await test.step(destination, async () => {
      await page.goto(destination)
      await expect(page).toHaveURL(`${app.origin}/?returnTo=${encodeURIComponent(destination)}`)
      await expect(
        page.getByRole('heading', { name: 'Good to see you', exact: true }),
      ).toBeVisible()
    })
  }
})

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
  await expect(page.getByRole('heading', { name: 'Good to see you', exact: true })).toBeFocused()
  await page.route('**/api/auth/signin/google*', async (route) => {
    expect(new URLSearchParams(route.request().postData()!).get('callbackUrl')).toBe(destination)
    await route.fallback()
  })
  await page.getByRole('button', { name: 'Choose another Google account' }).click()
  await expect(page.getByRole('heading', { name: 'Synthetic Google' })).toBeVisible()
  expect(page.url()).not.toContain(app.origin)
})
