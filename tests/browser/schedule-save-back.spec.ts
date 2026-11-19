import type { Page } from '@playwright/test'
import { expect, test } from './fixtures'
import { waitForClientRouter } from './actions'
import { toastMessage } from './locators'
import { insertScheduledMedicine } from './seed'

// #284: a schedule save opened from a medication's page, or its Manage view (#405), returns to
// that page's own entry.
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
    .getByLabel(/^Amount/)
    .first()
    .fill(quantity)
  await page.getByRole('button', { name: 'Save changes' }).press('Enter')
  await expect(toastMessage(page, 'Schedule saved for Back Fixture Medicine.')).toBeVisible()
  await expect(page).toHaveURL(detailUrl)
  await expect(
    page.getByRole('heading', { name: 'Back Fixture Medicine', exact: true }),
  ).toBeFocused()
}

const scheduleCard = (page: Page) => page.getByRole('group', { name: 'Schedule', exact: true })

const manageUrl = new RegExp(`/medications\\?medicine=${medicineId}&manage$`)

/** Opens Manage from the medication's page (403·B14). */
async function openManage(page: Page) {
  await page.getByRole('link', { name: 'Manage medication' }).click()
  await expect(page).toHaveURL(manageUrl)
  await expect(page.getByText('Manage', { exact: true })).toBeVisible()
}

// Allowed reasons: Back, Forward or reload behavior; focus moved after hydration.
test('Manage survives reload and Back/Forward, and Change schedule saved from it leaves the page in one Back', async ({
  page,
  app,
}) => {
  await page.goto('/medications')
  await waitForClientRouter(page)
  await page.getByRole('link', { name: 'View details for Back Fixture Medicine' }).click()
  await openManage(page)

  // #405: Manage is its own entry, kept by a direct reload and by Back and Forward.
  await page.reload()
  await expect(page).toHaveURL(manageUrl)
  await expect(page.getByRole('link', { name: 'Back Fixture Medicine', exact: true })).toBeVisible()
  await page.goBack()
  await expect(page).toHaveURL(detailUrl)
  await expect(page.getByRole('link', { name: 'Manage medication' })).toBeVisible()
  await page.goForward()
  await expect(page).toHaveURL(manageUrl)

  await page.getByRole('link', { name: 'Change schedule' }).click()
  await saveChange(page, '2')

  // Reload keeps the saved result on the medication page.
  await page.reload()
  await expect(page).toHaveURL(detailUrl)
  await expect(scheduleCard(page).getByText('2 tablets', { exact: true })).toBeVisible()

  await page.goBack()
  await expect(page).toHaveURL(app.origin + '/medications')
  await expect(page.getByRole('heading', { name: 'Medications', exact: true })).toBeVisible()

  // #405: on hydrated Manage, a confirmed Pause focuses Stop schedule, a confirmed Stop Change
  // schedule.
  await page.getByRole('link', { name: 'View details for Back Fixture Medicine' }).click()
  await openManage(page)
  await page.getByRole('button', { name: 'Pause', exact: true }).click()
  await page
    .getByRole('dialog', { name: 'Pause this schedule?' })
    .getByRole('button', { name: 'Pause schedule' })
    .click()
  await expect(toastMessage(page, 'Schedule paused for Back Fixture Medicine.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Stop schedule' })).toBeFocused()
  await page.getByRole('button', { name: 'Stop schedule' }).click()
  await page
    .getByRole('dialog', { name: 'Stop this schedule?' })
    .getByRole('button', { name: 'Stop schedule' })
    .click()
  await expect(toastMessage(page, 'Schedule stopped for Back Fixture Medicine.')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Change schedule' })).toBeFocused()
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
  await openManage(page)
  await page.getByRole('link', { name: 'Change schedule' }).click()
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(page).toHaveURL(detailUrl)
  await page.goBack()
  await expect(page).toHaveURL(app.origin + '/medications')

  await page.getByRole('link', { name: 'View details for Back Fixture Medicine' }).click()
  await openManage(page)
  await page.getByRole('link', { name: 'Change schedule' }).click()
  await page
    .getByLabel(/^Amount/)
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
