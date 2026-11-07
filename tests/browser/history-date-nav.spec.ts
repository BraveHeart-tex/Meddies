import type { Page } from '@playwright/test'
import { expect, test } from './fixtures'
import { scrollsHorizontally } from './actions'
import { datePicker, pickDate } from './pickers'
import { historyRows } from './locators'
import { addDays, insertScheduledMedicine } from './seed'

// FE-678 (D11, 648·H1 to H3, H6, H7): History steps one day at a time and every date is a URL.
const initialScheduleTime = '2035-06-15T09:00:00+03:00'
const today = initialScheduleTime.slice(0, 10)
const startDate = addDays(today, -3)

test.use({
  journey: {
    auth: true,
    storage: true,
    initialScheduleTime,
    seed: ({ db, ownerId }) =>
      insertScheduledMedicine(db, ownerId, {
        label: 'Stepping Fixture Medicine',
        startDate,
        times: [{ time: '08:00', quantity: 1 }],
      }),
  },
})

const picker = (page: Page) => datePicker(page, 'Choose a date')
const dayHeading = (page: Page, name: string) => page.getByRole('heading', { name, level: 2 })
const previous = (page: Page) => page.getByRole('button', { name: 'Previous day' })
const next = (page: Page) => page.getByRole('button', { name: 'Next day' })

test('step through History, go Back, reload, and recover from bad dates', async ({
  page,
  app,
}, testInfo) => {
  const historyUrl = (date: string) => `${app.origin}/history?date=${date}`

  await test.step('bare /history is today so far, with Next day disabled (648·H2)', async () => {
    await page.goto('/history')
    await expect(dayHeading(page, 'Friday 15 June, 1 dose')).toBeVisible()
    await expect(page.getByText('0 of 1 so far')).toBeVisible()
    await expect(page.getByText('Record it on Today')).toBeVisible()
    await expect(picker(page)).toHaveText('Today, Fri 15 Jun')
    await expect(next(page)).toBeDisabled()
    for (const button of [previous(page), next(page)]) {
      const box = await button.boundingBox()
      expect(box?.width).toBeGreaterThanOrEqual(44)
      expect(box?.height).toBeGreaterThanOrEqual(44)
    }
  })

  await test.step('Previous day pushes each date and focuses its heading (D11)', async () => {
    await previous(page).click()
    await expect(page).toHaveURL(historyUrl(addDays(today, -1)))
    await expect(dayHeading(page, 'Thursday 14 June, 1 dose')).toBeFocused()
    await expect(page.getByText('0 of 1 logged')).toBeVisible()
    await expect(historyRows(page, addDays(today, -1)).getByRole('button')).toHaveCount(0)
    await expect(next(page)).toBeEnabled()
    await previous(page).click()
    await expect(page).toHaveURL(historyUrl(addDays(today, -2)))
    await expect(picker(page)).toHaveText('Wed 13 Jun')
    await page.screenshot({ path: testInfo.outputPath('history-populated-402.png') })
  })

  await test.step('Back restores the previous date and reload keeps the current one', async () => {
    await page.goBack()
    await expect(page).toHaveURL(historyUrl(addDays(today, -1)))
    await expect(picker(page)).toHaveText('Thu 14 Jun')
    await expect(dayHeading(page, 'Thursday 14 June, 1 dose')).toBeVisible()
    await page.reload()
    await expect(page).toHaveURL(historyUrl(addDays(today, -1)))
    await expect(picker(page)).toHaveText('Thu 14 Jun')
    await next(page).click()
    await expect(page).toHaveURL(historyUrl(today))
    await expect(next(page)).toBeDisabled()
  })

  await test.step('a day before the first schedule is empty (648·H3)', async () => {
    const empty = addDays(startDate, -1)
    await pickDate(page, 'Choose a date', empty)
    await expect(page).toHaveURL(historyUrl(empty))
    await expect(page.getByText('No doses were scheduled on Monday 11 June.')).toBeFocused()
    await expect(historyRows(page, empty)).toHaveCount(0)
    await page.screenshot({ path: testInfo.outputPath('history-empty-402.png') })
  })

  for (const bad of ['2035-12-24', 'not-a-date'])
    await test.step(`${bad} shows today instead and replaces the URL (648·H6)`, async () => {
      await page.goto(`/history?date=${bad}`)
      await expect(page.getByText('That date is not available.')).toBeVisible()
      await expect(page.getByText('Showing today instead.', { exact: false })).toBeVisible()
      await expect(dayHeading(page, 'Friday 15 June, 1 dose')).toBeVisible()
      await expect(page).toHaveURL(historyUrl(today))
      await expect(picker(page)).toHaveText('Today, Fri 15 Jun')
    })
  await page.screenshot({ path: testInfo.outputPath('history-invalid-402.png') })
  await page.reload()
  await expect(page.getByText('That date is not available.')).toHaveCount(0)

  await test.step('at 320px the date bar keeps its three parts on one row (648·H7)', async () => {
    await page.setViewportSize({ width: 320, height: 740 })
    await page.goto(`/history?date=${addDays(today, -1)}`)
    await expect(dayHeading(page, 'Thursday 14 June, 1 dose')).toBeVisible()
    const [left, middle, right] = await Promise.all(
      [previous(page), picker(page), next(page)].map((part) => part.boundingBox()),
    )
    expect(Math.abs(left!.y + left!.height / 2 - (middle!.y + middle!.height / 2))).toBeLessThan(2)
    expect(Math.abs(right!.y + right!.height / 2 - (middle!.y + middle!.height / 2))).toBeLessThan(
      2,
    )
    expect(await scrollsHorizontally(page)).toBe(false)
    await page.screenshot({ path: testInfo.outputPath('history-populated-320.png') })
  })
})
