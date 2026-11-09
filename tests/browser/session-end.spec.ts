import type { Route } from '@playwright/test'
import { focusWindow } from './actions'
import { expect, test } from './fixtures'
import { doseTrigger, drawer } from './locators'
import { insertScheduledMedicine } from './seed'
import { chooseMedicineType } from './drawers'

const initialScheduleTime = '2035-06-15T09:00:00+03:00'
const today = initialScheduleTime.slice(0, 10)

test.use({
  journey: {
    auth: true,
    storage: true,
    initialScheduleTime,
    seed: ({ db, ownerId }) =>
      insertScheduledMedicine(db, ownerId, {
        label: 'Seeded Medicine',
        startDate: today,
        times: [{ time: '08:30', quantity: 1 }],
      }),
  },
})

const notice = 'A save was still in progress. After signing in, check whether it was recorded.'
const signIn = 'Continue with Google'

test('expiry with a pending save shows the notice, removes private content and returns fresh', async ({
  page,
  app,
}) => {
  const posts: string[] = []
  let held: Route | undefined
  await page.route('**/api/medicines', async (route) => {
    if (route.request().method() !== 'POST') return route.fallback()
    posts.push(route.request().postData()!)
    held = route
  })
  await page.goto('/medications?add')
  await page.getByLabel('Name', { exact: true }).fill('Private Magnesium')
  await page.getByLabel(/^Strength/).fill('200 mg')
  await chooseMedicineType(page, 'Tablet')
  await page.getByRole('button', { name: 'Save medication', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Saving medication...' })).toBeDisabled()

  await app.expireSession()
  await focusWindow(page)

  await expect(page.getByRole('button', { name: signIn })).toBeVisible()
  await expect(page).toHaveURL(
    `${app.origin}/?reason=expired&returnTo=%2Fmedications%3Fadd&notice=save-in-progress`,
  )
  await expect(page.getByRole('status')).toContainText(notice)
  await expect(page.getByText('Your session ended.', { exact: true })).toBeVisible()
  await expect(page.getByText('Private Magnesium')).toHaveCount(0)
  await expect(page.getByText(/cancel|not saved/i)).toHaveCount(0)
  expect(page.url()).not.toContain('Magnesium')
  await held?.abort().catch(() => {})

  await app.restoreSession()
  await page.reload()

  await expect(page).toHaveURL(`${app.origin}/medications?add`)
  await expect(page.getByLabel('Name', { exact: true })).toHaveValue('')
  await expect(page.getByLabel(/^Strength/)).toHaveValue('')
  await expect(page.getByText('Pick up where you left off', { exact: false })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Save medication', exact: true })).toBeEnabled()
  expect(posts).toHaveLength(1)
})

test('expiry closes an open dose drawer without its dismissal guard', async ({ page, app }) => {
  await page.goto('/')
  await doseTrigger(page, 'Seeded Medicine').click()
  await expect(drawer(page)).toBeVisible()

  await app.expireSession()
  await focusWindow(page)

  await expect(page.getByRole('button', { name: signIn })).toBeVisible()
  await expect(page).toHaveURL(`${app.origin}/?reason=expired&returnTo=%2F`)
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByText(notice)).toHaveCount(0)
  await expect(page.getByText('Seeded Medicine')).toHaveCount(0)
})

test('a read 401 confirmed by the session check ends the session at the current History date', async ({
  page,
  app,
}) => {
  await page.goto(`/history?date=${today}`)
  await expect(page.getByText('Seeded Medicine').first()).toBeVisible()

  await app.expireSession()
  await page.getByRole('button', { name: /Previous/ }).click()

  await expect(page.getByRole('button', { name: signIn })).toBeVisible()
  await expect(page).toHaveURL(
    new RegExp(`/\\?reason=expired&returnTo=%2Fhistory%3Fdate%3D\\d{4}-\\d{2}-\\d{2}$`),
  )
  await expect(page.getByText('Seeded Medicine')).toHaveCount(0)
})

test('a lost session check keeps the page and its private content', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText('Seeded Medicine').first()).toBeVisible()
  await page.route('**/api/session', (route) => route.abort('connectionfailed'))
  await focusWindow(page)
  await expect(page.getByRole('button', { name: signIn })).toHaveCount(0)
  await expect(page.getByText('Seeded Medicine').first()).toBeVisible()
})
