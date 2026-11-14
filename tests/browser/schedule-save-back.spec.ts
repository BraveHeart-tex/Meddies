import type { Page } from '@playwright/test'
import { expect, test } from './fixtures'
import { waitForClientRouter } from './actions'
import { insertScheduledMedicine } from './seed'

// #284: a schedule save opened from a medication's page returns to that page's own entry.
const initialScheduleTime = '2035-06-15T09:00:00+03:00'
const today = initialScheduleTime.slice(0, 10)
const medicineId = '00000000-0000-4000-8000-000000000284'

test.use({
  journey: {
    auth: true,
    storage: true,
    initialScheduleTime,
    seed: ({ db, ownerId }) =>
      insertScheduledMedicine(db, ownerId, {
        label: 'Back Fixture Medicine',
        startDate: today,
        times: [{ time: '20:00', quantity: 1 }],
        medicineId,
      }),
  },
})

const detailUrl = new RegExp(`/medications\\?medicine=${medicineId}$`)

async function saveChange(page: Page, quantity: string) {
  await page
    .getByLabel(/^Quantity/)
    .first()
    .fill(quantity)
  await page.getByRole('button', { name: 'Save changes' }).press('Enter')
  await expect(page.getByText('Schedule saved for Back Fixture Medicine.')).toBeVisible()
  await expect(page).toHaveURL(detailUrl)
  await expect(page.getByRole('heading', { name: 'Back Fixture Medicine' })).toBeFocused()
}

const scheduleCard = (page: Page) => page.getByRole('region', { name: 'Schedule', exact: true })

// Allowed reason: Back, Forward or reload behavior.
test('Change schedule saved from the medication page leaves it in one Back', async ({
  page,
  app,
}) => {
  await page.goto('/medications')
  await waitForClientRouter(page)
  await page.getByRole('link', { name: 'View details for Back Fixture Medicine' }).click()
  await page.getByRole('link', { name: 'Change schedule' }).click()
  await saveChange(page, '2')

  // Reload keeps the saved result on the medication page.
  await page.reload()
  await expect(page).toHaveURL(detailUrl)
  await expect(scheduleCard(page).getByText('2 tablets', { exact: true })).toBeVisible()

  await page.goBack()
  await expect(page).toHaveURL(app.origin + '/medications')
  await expect(page.getByRole('heading', { name: 'Medications', exact: true })).toBeVisible()
})

// Allowed reason: Back, Forward or reload behavior.
test('a schedule form opened from a direct link replaces its URL on save', async ({
  page,
  app,
}) => {
  await page.goto('/medications')
  await page.goto(`/medications?schedule=${medicineId}`)
  await waitForClientRouter(page)
  await saveChange(page, '3')
  // Replaced, not pushed: Back skips the submitted form.
  await page.goBack()
  await expect(page).toHaveURL(app.origin + '/medications')
})

// Allowed reason: Back, Forward or reload behavior.
test('unsaved Change schedule exits leave the medication page in one Back', async ({
  page,
  app,
}) => {
  await page.goto('/medications')
  await waitForClientRouter(page)
  await page.getByRole('link', { name: 'View details for Back Fixture Medicine' }).click()
  await page.getByRole('link', { name: 'Change schedule' }).click()
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(page).toHaveURL(detailUrl)
  await page.goBack()
  await expect(page).toHaveURL(app.origin + '/medications')

  await page.getByRole('link', { name: 'View details for Back Fixture Medicine' }).click()
  await page.getByRole('link', { name: 'Change schedule' }).click()
  await page
    .getByLabel(/^Quantity/)
    .first()
    .fill('2')
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  await page.getByRole('button', { name: 'Discard', exact: true }).click()
  await expect(page).toHaveURL(detailUrl)
  await page.goBack()
  await expect(page).toHaveURL(app.origin + '/medications')

  await page.goto(`/medications?schedule=${medicineId}`)
  await waitForClientRouter(page)
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(page).toHaveURL(detailUrl)
  await page.goBack()
  await expect(page).toHaveURL(app.origin + '/medications')
})
