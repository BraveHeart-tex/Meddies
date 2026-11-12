import { expect, test } from './fixtures'
import { datePicker, expectTime, pickDate, pickTime } from './pickers'
import { doseTrigger, historyList, historyRows, intakeTime, drawer, toastMessage } from './locators'
import { addDays, insertScheduledMedicine, insertSkippedRecord, insertTakenRecord } from './seed'

// History shows the day before the frozen scheduling clock, in Europe/Istanbul.
const initialScheduleTime = '2035-06-15T09:00:00+03:00'
const now = new Date(initialScheduleTime)
const historyDate = () => addDays(initialScheduleTime.slice(0, 10), -1)

test.use({
  journey: {
    auth: true,
    storage: true,
    initialScheduleTime,
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
      await insertTakenRecord(db, ownerId, {
        scheduleId,
        dueAt: dueAt('08:00'),
        takenAt: now.toISOString(),
        quantity: 0.5,
      })
      await insertSkippedRecord(db, ownerId, {
        scheduleId,
        dueAt: dueAt('09:00'),
        recordedAt: now.toISOString(),
      })
    },
  },
})

test('review, edit and correct past doses in History', async ({
  page,
  request,
  browser,
  app,
}, testInfo) => {
  const date = historyDate()
  const rows = historyRows(page, date)
  const first = rows.first()
  const dialog = drawer(page)
  const reviewFirst = () => doseTrigger(first).click()

  await test.step('deny anonymous history access', async () => {
    const anonymous = await request.get(`/history?date=${date}`)
    expect(anonymous.status()).toBe(200)
    const body = await anonymous.text()
    expect(body).not.toMatch(/History Fixture Medicine/)

    // The route's loading state starts the stream, so the redirect to sign-in runs in the browser.
    const signedOut = await browser.newContext({ baseURL: app.origin })
    const visitor = await signedOut.newPage()
    await visitor.goto(`/history?date=${date}`)
    await expect(
      visitor.getByRole('heading', { name: 'Good to see you', exact: true }),
    ).toBeVisible()
    await expect(visitor).toHaveURL(
      `${app.origin}/?returnTo=${encodeURIComponent(`/history?date=${date}`)}`,
    )
    await expect(visitor.getByText('History Fixture Medicine')).toHaveCount(0)
    await signedOut.close()
  })

  await test.step('open history from the signed-in home page', async () => {
    await page.goto('/')
    await page
      .getByRole('navigation', { name: 'Primary' })
      .getByRole('link', { name: 'History' })
      .click()
    await expect(page.getByRole('heading', { name: 'History', level: 1 })).toBeVisible()
  })

  await test.step('pick a historical date', async () => {
    await pickDate(page, 'Choose a date', date)
    await expect(datePicker(page, 'Choose a date')).toHaveText('Thu 14 Jun')
    await expect(page).toHaveURL(new RegExp(`date=${date}`))
    await expect(rows).toHaveCount(3)
    const list = historyList(page, date)
    await expect(list).toContainText('Taken')
    await expect(list).toContainText('Skipped')
    await expect(list).toContainText('Not logged')
    await expect(list, 'Taken outcome should show its actual date').toContainText(
      'Taken on Fri 15 Jun',
    )
    await expect(list).toContainText('took ½ tablet')
    await expect(list).toContainText('2 tablets')
    await expect(list).toContainText('1½ tablets')
    // Not logged rows are not buttons (108·H1).
    await expect(rows.nth(2).getByRole('button')).toHaveCount(0)
    await page.screenshot({ path: testInfo.outputPath('dose-history.png') })
  })

  await test.step('edit actual intake details without changing the schedule', async () => {
    const originalTakenAt = await intakeTime(first).getAttribute('datetime')
    await reviewFirst()
    await dialog.getByRole('button', { name: /^Edit dose for/ }).click()
    await expect(dialog.getByLabel(/^Amount/)).toHaveValue('½')
    await expect(datePicker(dialog, 'Taken date in Istanbul')).toHaveText('Today, Fri 15 Jun')
    await expectTime(dialog, 'Taken time in Istanbul', '09:00')
    await dialog.getByLabel(/^Amount/).fill('1.5')
    await dialog.getByRole('button', { name: 'Save changes' }).click()
    await expect(first).toContainText('took 1½ tablets')
    await expect(
      toastMessage(
        page,
        /^History Fixture Medicine \d\d:\d\d · updated to taken at .*, 1½ tablets$/,
      ),
    ).toBeVisible()
    await expect(intakeTime(first)).toHaveAttribute('datetime', originalTakenAt!)
  })

  await test.step('edit actual time while preserving quantity', async () => {
    await reviewFirst()
    await dialog.getByRole('button', { name: /^Edit dose for/ }).click()
    await pickDate(page, 'Taken date in Istanbul', date)
    await pickTime(page, 'Taken time in Istanbul', '12:00')
    await dialog.getByRole('button', { name: 'Save changes' }).click()
    await expect(intakeTime(first)).toHaveAttribute('datetime', `${date}T09:00:00.000Z`)
    await expect(first).toContainText('12:00')
    await expect(first).toContainText('took 1½ tablets')
    await page.screenshot({ path: testInfo.outputPath('dose-history-edited.png') })
    await page.reload()
    await expect(first).toContainText('took 1½ tablets')
    await expect(intakeTime(first)).toHaveAttribute('datetime', `${date}T09:00:00.000Z`)
  })

  await test.step('correct a Taken history outcome to Skipped', async () => {
    await reviewFirst()
    await dialog.getByRole('button', { name: /^Change dose for/ }).click()
    await dialog.getByRole('button', { name: 'I skipped it' }).click()
    await dialog.getByRole('button', { name: 'Save as skipped' }).click()
    await expect(first.getByText('Skipped', { exact: true })).toBeVisible()
    await expect(first).not.toContainText('took')
    await page.screenshot({ path: testInfo.outputPath('dose-history-corrected.png') })
  })

  await test.step('reload and preserve persisted history', async () => {
    await page.reload()
    await expect(first.getByText('Skipped', { exact: true })).toBeVisible()
    await expect(historyList(page, date)).toContainText('Not logged')
  })
})
