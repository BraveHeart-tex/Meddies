import type { Page } from '@playwright/test'
import { expect, test } from './fixtures'
import { scrollsHorizontally } from './actions'
import { datePicker } from './pickers'
import { addDays, insertScheduledMedicine } from './seed'

// FE-678 (648·H7): the on-request review of the History date bar's sizes and alignment.
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

test('History date bar sizes and alignment @visual', async ({ page }, testInfo) => {
  await page.goto('/history')
  await expect(next(page)).toBeDisabled()
  for (const button of [previous(page), next(page)]) {
    const box = await button.boundingBox()
    expect(box?.width).toBeGreaterThanOrEqual(44)
    expect(box?.height).toBeGreaterThanOrEqual(44)
  }

  await test.step('at 320px the date bar keeps its three parts on one row (648·H7)', async () => {
    await page.setViewportSize({ width: 320, height: 740 })
    await page.goto(`/history?date=${addDays(today, -1)}`)
    await expect(dayHeading(page, 'Thursday, 14 June, 1 dose')).toBeVisible()
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
