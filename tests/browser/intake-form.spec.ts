import { randomUUID } from 'node:crypto'
import { expect, test } from './fixtures'
import { pickDate, pickTime } from './pickers'
import { doseRow, doseStatus, doseTrigger, drawer, instant } from './locators'
import { insertScheduledMedicine, insertTakenRecord } from './seed'

const initialScheduleTime = '2035-06-15T12:00:00+03:00'
const today = initialScheduleTime.slice(0, 10)
const morning = new Date(`${today}T08:00:00+03:00`).toISOString()
const mid = new Date(`${today}T10:00:00+03:00`).toISOString()
// A recorded intake with sub-minute precision; an unchanged minute must keep it.
const preciseTakenAt = '2035-06-15T07:05:42.123Z'
const scheduleId = randomUUID()

test.use({
  journey: {
    auth: true,
    storage: true,
    initialScheduleTime,
    seed: async ({ db, ownerId }) => {
      await insertScheduledMedicine(db, ownerId, {
        label: 'Intake Medicine',
        startDate: today,
        times: [
          { time: '08:00', quantity: 1 },
          { time: '10:00', quantity: 1 },
        ],
        scheduleId,
      })
      await insertTakenRecord(db, ownerId, {
        scheduleId,
        dueAt: mid,
        takenAt: preciseTakenAt,
        quantity: 1,
      })
    },
  },
})

test('record and edit an intake with inline validation and an uncertain retry', async ({
  page,
}) => {
  const dialog = drawer(page)
  const amount = dialog.getByLabel(/^Amount/)

  await test.step('inline errors focus the first invalid control and keep values', async () => {
    await page.goto('/')
    await doseTrigger(doseRow(page, morning)).press('Enter')
    await dialog.getByRole('button', { name: 'I took it' }).click()
    await expect(dialog.getByRole('button', { name: 'Now · 12:00' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await amount.fill('')
    await dialog.getByRole('button', { name: 'Other', exact: true }).click()
    await pickDate(page, 'Taken date in Istanbul', today)
    await pickTime(page, 'Taken time in Istanbul', '13:00')
    await dialog.getByRole('button', { name: 'Save as taken' }).click()
    await expect(dialog.getByText('Choose a time that has passed.')).toBeVisible()
    await expect(dialog.getByText('Enter a quantity.')).toBeVisible()
    await expect(amount).toHaveAttribute('aria-invalid', 'true')
    await expect(dialog.getByRole('combobox', { name: /hour$/ })).toBeFocused()
    await pickTime(page, 'Taken time in Istanbul', '11:30')
    await expect(dialog.getByText('Choose a time that has passed.')).toHaveCount(0)
    await amount.fill('1.25')
    await expect(dialog.getByText('Use whole or half tablets.')).toBeVisible()
    await amount.fill('1½')
    await expect(dialog.getByText('Use whole or half tablets.')).toHaveCount(0)
  })

  await test.step('an unconfirmed save keeps details and retries the same save', async () => {
    let loseResponse = true
    await page.route(
      (url) => url.pathname === '/api/schedules',
      async (route) => {
        if (!loseResponse || route.request().method() !== 'PUT') return route.fallback()
        loseResponse = false
        await route.fetch()
        await route.abort('connectionfailed')
      },
    )
    await dialog.getByRole('button', { name: 'Save as taken' }).click()
    await expect(dialog.getByText('Save could not be confirmed.')).toBeVisible()
    await expect(dialog.getByText('it will not be saved twice.')).toBeVisible()
    await expect(amount).toHaveValue('1½')
    await amount.fill('2')
    await expect(dialog.getByText('Changing details starts a new save.')).toBeVisible()
    await expect(dialog.getByRole('button', { name: 'Save as taken' })).toBeVisible()
    await amount.fill('1½')
    await dialog.getByRole('button', { name: 'Retry saving as taken' }).click()
    await expect(doseStatus(doseRow(page, morning))).toHaveAccessibleDescription(/Taken/)
    await expect(dialog).toHaveCount(0)
  })

  await test.step('editing only the amount keeps the exact recorded instant', async () => {
    const row = doseRow(page, mid)
    await doseTrigger(row).press('Enter')
    await dialog.getByRole('button', { name: /^Edit intake/ }).click()
    await expect(amount).toHaveValue('1')
    await amount.fill('2')
    await dialog.getByRole('button', { name: 'Save intake changes' }).click()
    await expect(dialog).toHaveCount(0)
    await expect(row).toContainText('took 2 tablets')
    await expect(instant(row, preciseTakenAt)).toBeVisible()
  })
})
