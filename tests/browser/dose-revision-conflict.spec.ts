import { randomUUID } from 'node:crypto'
import { expect, test } from './fixtures'
import { doseRow, doseStatus, doseTrigger, drawer } from './locators'
import { insertScheduledMedicine, insertTakenRecord } from './seed'

const initialScheduleTime = '2035-06-15T12:00:00+03:00'
const today = initialScheduleTime.slice(0, 10)
const dueAt = new Date(`${today}T08:00:00+03:00`).toISOString()
const scheduleId = randomUUID()

test.use({
  journey: {
    auth: true,
    storage: true,
    initialScheduleTime,
    seed: async ({ db, ownerId }) => {
      await insertScheduledMedicine(db, ownerId, {
        label: 'Conflict Medicine',
        startDate: today,
        times: [{ time: '08:00', quantity: 1 }],
        scheduleId,
      })
      await insertTakenRecord(db, ownerId, { scheduleId, dueAt, takenAt: dueAt, quantity: 1 })
    },
  },
})

test('a stale correction gets explicit recovery', async ({ page, app }, testInfo) => {
  const row = doseRow(page, dueAt)
  const trigger = doseTrigger(row)
  const dialog = drawer(page)

  await test.step('start correcting a Taken dose to Skipped', async () => {
    await page.goto('/')
    await expect(doseStatus(row)).toHaveAccessibleDescription(/Taken/)
    await trigger.press('Enter')
    await dialog.getByRole('button', { name: /^Change dose for/ }).click()
    await dialog.getByRole('button', { name: 'I skipped it' }).click()
    await expect(dialog.getByRole('button', { name: 'Save as skipped' })).toBeVisible()
  })

  await test.step('change the same dose elsewhere while the correction is open', async () => {
    await app.api('PATCH', '/api/schedules', {
      actionId: randomUUID(),
      expectedRevision: 0,
      expectedOutcome: 'Taken',
      outcome: 'Taken',
      takenAt: dueAt,
      quantity: 2,
      scheduleId,
      dueAt,
    })
  })

  await test.step('save the stale correction and get explicit recovery', async () => {
    await dialog.getByRole('button', { name: 'Save as skipped' }).click()
    await expect(
      page.getByText(
        "This dose changed somewhere else, so your change didn't save. Check what's saved now before changing it again.",
      ),
    ).toBeVisible()
    await expect(dialog, 'Conflict should close the correction drawer').toHaveCount(0)
    await expect(row).toContainText("so your change didn't save")
    await expect(row.getByRole('button', { name: "Check what's saved" })).toBeVisible()
    await expect(doseStatus(row)).toHaveAccessibleDescription(/Taken/)
    await expect(row).toContainText('took 2 tablets')
    await expect(row).not.toContainText('Skipped')
    await expect(trigger).toBeFocused()
    await page.screenshot({ path: testInfo.outputPath('revision-conflict.png') })
  })

  await test.step('review the current outcome and correct it again', async () => {
    await row.getByRole('button', { name: "Check what's saved" }).click()
    await trigger.press('Enter')
    await expect(dialog).toContainText('Taken 2 tablets')
    await dialog.getByRole('button', { name: /^Change dose for/ }).click()
    await dialog.getByRole('button', { name: 'I skipped it' }).click()
    await dialog.getByRole('button', { name: 'Save as skipped' }).click()
    await expect(doseStatus(row)).toHaveAccessibleDescription(/Skipped/)
  })

  await test.step('reload and keep the corrected outcome', async () => {
    await page.reload()
    await expect(doseStatus(row)).toHaveAccessibleDescription(/Skipped/)
  })
})
