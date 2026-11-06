import { expect, test } from './fixtures'
import { doseTrigger, historyList, historyRows, intakeTime, drawer } from './locators'
import {
  addDays,
  insertScheduledMedicine,
  insertSkippedRecord,
  insertTakenRecord,
  istanbulDate,
} from './seed'

// Uses the real clock: History shows yesterday in Europe/Istanbul.
const historyDate = () => addDays(istanbulDate(new Date()), -1)

test.use({
  journey: {
    auth: true,
    storage: true,
    seed: async ({ db, ownerId }) => {
      const date = historyDate()
      const { scheduleId } = await insertScheduledMedicine(db, ownerId, {
        label: 'History Fixture Medicine',
        startDate: date,
        times: [
          { time: '08:00', quantity: 1 },
          { time: '09:00', quantity: 2 },
          { time: '10:00', quantity: 1.5 },
        ],
      })
      const dueAt = (time: string) => new Date(`${date}T${time}:00+03:00`).toISOString()
      const now = new Date().toISOString()
      await insertTakenRecord(db, ownerId, {
        scheduleId,
        dueAt: dueAt('08:00'),
        takenAt: now,
        quantity: 0.5,
      })
      await insertSkippedRecord(db, ownerId, { scheduleId, dueAt: dueAt('09:00'), recordedAt: now })
    },
  },
})

test('review, edit and correct past doses in History', async ({ page, request }, testInfo) => {
  const date = historyDate()
  const rows = historyRows(page, date)
  const first = rows.first()
  const dialog = drawer(page)
  const reviewFirst = () => doseTrigger(first).click()

  await test.step('deny anonymous history access', async () => {
    const anonymous = await request.get(`/history?date=${date}`)
    expect(anonymous.status()).toBe(200)
    const body = await anonymous.text()
    expect(body).toMatch(/Sign in to view dose history/)
    expect(body).not.toMatch(/History Fixture Medicine/)
  })

  await test.step('open history from the signed-in home page', async () => {
    await page.goto('/')
    await page
      .getByRole('navigation', { name: 'Primary' })
      .getByRole('link', { name: 'History' })
      .click()
    await expect(page.getByRole('heading', { name: 'Dose history' })).toBeVisible()
  })

  await test.step('submit historical date from the keyboard', async () => {
    await page.getByLabel('Choose a date').fill(date)
    await page.getByRole('button', { name: 'View' }).press('Enter')
    await expect(page).toHaveURL(new RegExp(`date=${date}`))
    await expect(rows).toHaveCount(3)
    const list = historyList(page, date)
    await expect(list).toContainText('Taken')
    await expect(list).toContainText('Skipped')
    await expect(list).toContainText('Not logged')
    const actualIntakeDate = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Istanbul',
      dateStyle: 'medium',
    }).format(new Date())
    await expect(list, 'Taken outcome should show its actual date').toContainText(actualIntakeDate)
    await expect(list).toContainText('0.5 tablet')
    await expect(list).toContainText('2 tablet')
    await expect(list).toContainText('1.5 tablet')
    await expect(page.getByRole('link', { name: 'Back to Today' })).toBeVisible()
    await page.screenshot({ path: testInfo.outputPath('dose-history.png') })
  })

  await test.step('edit actual intake details without changing the schedule', async () => {
    const originalTakenAt = await intakeTime(first).getAttribute('datetime')
    await reviewFirst()
    await dialog.getByRole('button', { name: /^Edit intake/ }).click()
    await expect(dialog.getByLabel(/^Amount/)).toHaveValue('0.5')
    await expect(dialog.getByLabel('Taken date and time in Istanbul')).not.toHaveValue('')
    await dialog.getByLabel(/^Amount/).fill('1.5')
    await dialog.getByRole('button', { name: 'Save intake changes' }).click()
    await expect(first).toContainText('quantity 1.5 tablet')
    await expect(first.getByRole('status')).toContainText(
      /Saved changes for History Fixture Medicine.*Outcome: taken/,
    )
    await expect(intakeTime(first)).toHaveAttribute('datetime', originalTakenAt!)
  })

  await test.step('edit actual time while preserving quantity', async () => {
    await reviewFirst()
    await dialog.getByRole('button', { name: /^Edit intake/ }).click()
    await dialog.getByLabel('Taken date and time in Istanbul').fill(`${date}T12:00`)
    await dialog.getByRole('button', { name: 'Save intake changes' }).click()
    await expect(intakeTime(first)).toHaveAttribute('datetime', `${date}T09:00:00.000Z`)
    await expect(first).toContainText('12:00')
    await expect(first).toContainText('quantity 1.5 tablet')
    await page.screenshot({ path: testInfo.outputPath('dose-history-edited.png') })
    await page.reload()
    await expect(first).toContainText('quantity 1.5 tablet')
    await expect(intakeTime(first)).toHaveAttribute('datetime', `${date}T09:00:00.000Z`)
  })

  await test.step('correct a Taken history outcome to Skipped', async () => {
    await reviewFirst()
    await dialog.getByRole('button', { name: /^Correct outcome/ }).click()
    await dialog.getByRole('button', { name: 'I skipped it' }).click()
    await dialog.getByRole('button', { name: 'Save as skipped' }).click()
    await expect(first.getByText('Skipped', { exact: true })).toBeVisible()
    await expect(first).not.toContainText('quantity')
    await page.screenshot({ path: testInfo.outputPath('dose-history-corrected.png') })
  })

  await test.step('reload and preserve persisted history', async () => {
    await page.reload()
    await expect(first.getByText('Skipped', { exact: true })).toBeVisible()
    await expect(historyList(page, date)).toContainText('Not logged')
  })
})
