import { expect, test } from './fixtures'
import { expectTime, pickTime } from './pickers'
import { focusWindow } from './actions'
import { doseRow, doseStatus, doseTrigger, instant, drawer, takenDay } from './locators'
import { insertScheduledMedicine } from './seed'

const initialScheduleTime = '2035-06-15T09:00:00+03:00'
const today = initialScheduleTime.slice(0, 10)
const dueAt = new Date(`${today}T09:05:00+03:00`).toISOString()
const draftTime = `${today}T09:04`
const takenAt = new Date(`${draftTime}:00+03:00`).toISOString()

test.use({
  journey: {
    auth: true,
    storage: true,
    initialScheduleTime,
    seed: ({ db, ownerId }) =>
      insertScheduledMedicine(db, ownerId, {
        label: 'Rollover Medicine',
        startDate: today,
        times: [{ time: '09:05', quantity: 1 }],
      }),
  },
})

test('an open Taken draft survives the due-time rollover', async ({ page, app }, testInfo) => {
  const row = doseRow(page, dueAt)
  const trigger = doseTrigger(row, 'Rollover Medicine')
  const status = doseStatus(row)
  const dialog = drawer(page)
  const takenDate = takenDay(dialog, today)
  const amount = dialog.getByLabel(/^Amount/)

  await test.step('open an upcoming dose and start a Taken draft', async () => {
    await page.goto('/')
    await expect(status).toHaveAccessibleDescription(/Scheduled/)
    await trigger.press('Enter')
    await dialog.getByRole('button', { name: 'I took it' }).click()
    await expect(dialog.getByRole('button', { name: 'Save as taken' })).toBeVisible()
    await dialog.getByRole('button', { name: 'Other', exact: true }).click()
    await takenDate.click()
    await pickTime(page, 'Taken time in Istanbul', draftTime.slice(11))
    await amount.fill('2')
  })

  const expectDraftIntact = async () => {
    await expect(dialog).toHaveCount(1)
    await expect(amount).toHaveValue('2')
    await expect(takenDate).toHaveAttribute('aria-pressed', 'true')
    await expectTime(dialog, 'Taken time in Istanbul', draftTime.slice(11))
  }

  await test.step('reach the due time and refresh Today with the draft open', async () => {
    await app.setScheduleTime(`${today}T09:05:00+03:00`)
    await focusWindow(page)
    await expect(status).toHaveAccessibleDescription(/Due now/)
    await expectDraftIntact()
  })

  await test.step('pass the due time and refresh Today with the draft open', async () => {
    await app.setScheduleTime(`${today}T09:20:00+03:00`)
    await focusWindow(page)
    await expect(status).toHaveAccessibleDescription(/Not logged/)
    await page.screenshot({ path: testInfo.outputPath('draft-after-rollover.png') })
    await expectDraftIntact()
  })

  await test.step('save the preserved draft', async () => {
    await dialog.getByRole('button', { name: 'Save as taken' }).click()
    await expect(instant(row, takenAt)).toBeVisible()
    await expect(status).toHaveAccessibleDescription(/Taken/)
    await expect(row).toContainText('took 2 tablets')
    await expect(dialog).toHaveCount(0)
  })
})
