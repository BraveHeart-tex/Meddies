import { expect, test } from './fixtures'
import { insertScheduledMedicine, insertTakenRecord } from './seed'
import { doseTrigger, drawer, instant } from './locators'
import { scrollsHorizontally, todayReflow, enlargeText } from './actions'

const day = '2035-06-15'
const at = (time: string) => new Date(`${day}T${time}:00+03:00`).toISOString()
const label = `Long medication name ${'M'.repeat(75)}`

test.use({
  journey: {
    auth: true,
    storage: true,
    initialScheduleTime: `${day}T14:00:00+03:00`,
    seed: async ({ db, ownerId }) => {
      const { scheduleId } = await insertScheduledMedicine(db, ownerId, {
        label,
        startDate: day,
        times: Array.from({ length: 12 }, (_, index) => ({
          time: `${String(index + 8).padStart(2, '0')}:00`,
          quantity: 1,
        })),
      })
      await insertTakenRecord(db, ownerId, {
        scheduleId,
        dueAt: at('08:00'),
        takenAt: at('08:05'),
        quantity: 1,
      })
    },
  },
})

test('long Today groups reflow and their last action stays reachable', async ({
  page,
}, testInfo) => {
  await page.goto('/')
  const list = page.getByRole('list', { name: "Today's doses" })
  await expect(list.getByRole('listitem')).toHaveCount(12)
  for (const width of [402, 320]) {
    await page.setViewportSize({ width, height: 874 })
    await expect(page.getByRole('heading', { name: 'To log · 6' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Later today · 5' })).toBeVisible()
    expect(await scrollsHorizontally(page)).toBe(false)
    expect(await todayReflow(list, width)).toBe(true)
    await page.screenshot({ path: testInfo.outputPath(`today-${width}.png`), fullPage: true })
  }
  const lastRow = list.getByRole('listitem').last()
  await expect(instant(lastRow, at('08:00'))).toHaveText('08:00')
  await doseTrigger(lastRow).click()
  await expect(drawer(page).getByRole('heading', { name: label })).toBeVisible()
  await drawer(page).getByRole('button', { name: 'Close dose details' }).click()
  await expect(doseTrigger(lastRow)).toBeFocused()
  // Synthetic 200% root-font probe, not an OS text-size or device claim.
  await enlargeText(page)
  expect(await scrollsHorizontally(page)).toBe(false)
  expect(await todayReflow(list, 320)).toBe(true)
  await page.screenshot({ path: testInfo.outputPath('today-320-text-200.png'), fullPage: true })
})
