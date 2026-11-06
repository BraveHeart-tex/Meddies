import { expect, test } from './fixtures'
import { datePicker, expectTime, pickDate, pickTime } from './pickers'
import { focusWindow } from './actions'
import { doseRow, doseTrigger, historyRow, historyRows, instant, drawer } from './locators'

const initialScheduleTime = '2035-06-15T09:00:00+03:00'
const today = initialScheduleTime.slice(0, 10)
const todayLabel = 'Fri, 15 Jun 2035'
const time = '09:05'
const dueAt = new Date(`${today}T${time}:00+03:00`).toISOString()
const takenAt = new Date(initialScheduleTime).toISOString()

test.use({ journey: { auth: true, storage: true, initialScheduleTime } })

test('set up, record, correct and recover a routine on a phone', async ({ page, app }) => {
  const nav = page.getByRole('navigation', { name: 'Primary' })
  const dialog = drawer(page)
  const historyUrl = `/history?date=${today}`
  const historyDate = datePicker(page, 'Choose a date')
  const scheduled = historyRow(page, today, dueAt)

  const expectHistoryDose = async (status: string) => {
    await expect(scheduled).toBeVisible()
    await expect(page).toHaveURL(app.origin + historyUrl)
    await expect(historyDate).toHaveText(todayLabel)
    await expect(historyRows(page, today)).toHaveCount(1)
    await expect(scheduled).toContainText('Routine Medicine')
    await expect(scheduled.getByText(status, { exact: true })).toBeVisible()
  }

  await test.step('open signed-in Today and save a medicine', async () => {
    await page.goto('/')
    await expect(nav).toBeVisible()
    await nav.getByRole('link', { name: 'Medications' }).click()
    await expect(page.getByRole('heading', { name: 'Medications' })).toBeVisible()
    await page.getByRole('link', { name: 'Add a medicine' }).click()
    await page.getByLabel('Medicine name').fill('Routine Medicine')
    await page.getByLabel(/^Product strength/).fill('5 mg')
    await page.getByRole('button', { name: 'Tablet' }).click()
    await page.getByRole('button', { name: 'Save medicine' }).press('Enter')
    await expect(page.getByText('Routine Medicine saved.')).toBeVisible()
    const setSchedule = page
      .getByRole('region', { name: 'Saved medicine' })
      .getByRole('link', { name: 'Set schedule' })
    await expect(setSchedule).toHaveAttribute('href', /^\/medications\?schedule=[\w-]+/)
    await setSchedule.press('Enter')
    await expect(page.getByRole('heading', { name: 'Set dose schedule' })).toBeVisible()
    await expect(page.getByText('Medicine: Routine Medicine')).toBeVisible()
  })

  await test.step('retry an uncertain schedule save without losing setup', async () => {
    await pickDate(page, 'Start date in Istanbul', today)
    await pickTime(page, 'Time 1', time)
    await page.getByLabel(/^Quantity/).fill('1')
    // The first save reaches the server, but its response is lost on the way back.
    let loseResponse = true
    await page.route(
      (url) => url.pathname === '/api/schedules',
      async (route) => {
        if (!loseResponse || route.request().method() !== 'POST') return route.fallback()
        loseResponse = false
        await route.fetch()
        await route.abort('connectionfailed')
      },
    )
    await page.getByRole('button', { name: 'Save schedule' }).press('Enter')
    await expect(page.getByText('Save could not be confirmed.')).toBeVisible()
    await expectTime(page, 'Time 1', time)
    await page.getByRole('button', { name: 'Retry saving schedule' }).press('Enter')
    await expect(page.getByText('Schedule saved.')).toBeVisible()
    await page.reload()
    await expect(page.getByText(`Daily at ${time}`)).toHaveCount(1)
  })

  await test.step('record the scheduled dose before it is due', async () => {
    await nav.getByRole('link', { name: 'Today' }).click()
    await doseTrigger(page, 'Routine Medicine').press('Enter')
    await dialog.getByRole('button', { name: 'I took it' }).click()
    await expect(dialog.getByRole('button', { name: 'Save as taken' })).toBeVisible()
    await dialog.getByRole('button', { name: 'Other', exact: true }).click()
    await pickDate(page, 'Taken date in Istanbul', today)
    await pickTime(page, 'Taken time in Istanbul', initialScheduleTime.slice(11, 16))
    await dialog.getByRole('button', { name: 'Save as taken' }).press('Enter')
    await expect(instant(doseRow(page, dueAt), takenAt)).toBeVisible()
  })

  await test.step('the recorded dose is absent from dated History before it is due', async () => {
    await page.goto(historyUrl)
    await expect(page.getByText('No past doses for this date.')).toBeVisible()
    await expect(historyDate).toHaveText(todayLabel)
    await expect(historyRows(page, today)).toHaveCount(0)
  })

  await test.step('advance past the due time and find the taken dose in History', async () => {
    await app.setScheduleTime(`${today}T09:06:00+03:00`)
    await page.reload()
    await expectHistoryDose('Taken')
  })

  await test.step('correct the History dose and verify it persists after reload', async () => {
    await doseTrigger(scheduled).click()
    await dialog.getByRole('button', { name: /^Correct outcome/ }).click()
    await dialog.getByRole('button', { name: 'I skipped it' }).click()
    await dialog.getByRole('button', { name: 'Save as skipped' }).click()
    await expectHistoryDose('Skipped')
    await page.reload()
    await expectHistoryDose('Skipped')
  })

  await test.step('save another medicine without a schedule and reload', async () => {
    await nav.getByRole('link', { name: 'Medications' }).click()
    await page.getByRole('link', { name: 'Add a medicine' }).click()
    await page.getByLabel('Medicine name').fill('Evening Vitamin')
    await page.getByRole('button', { name: 'Capsule' }).click()
    await page.getByRole('button', { name: 'Save medicine' }).press('Enter')
    await expect(page.getByText('Evening Vitamin saved.')).toBeVisible()
    await page.getByRole('link', { name: 'Done for now' }).click()
    await expect(page).toHaveURL(/\/medications$/)
    await page.reload()
    await page.getByRole('link', { name: 'View details for Evening Vitamin' }).click()
    await expect(page.getByRole('heading', { name: 'Evening Vitamin' })).toBeVisible()
    await expect(page.getByRole('region', { name: 'Saved routine' })).toContainText(
      'No schedule saved yet.',
    )
  })

  await test.step('recover from session expiry on Settings', async () => {
    await page.getByRole('link', { name: 'Settings' }).click()
    await expect(page.getByText('Private account access')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible()
    await app.expireSession()
    await focusWindow(page)
    await expect(page.getByRole('heading', { name: 'Your routine, in your hands' })).toBeVisible()
    await expect(page.getByText(/session ended/i)).toBeVisible()
    await expect(page).toHaveURL(/returnTo=%2Fsettings/)
  })
})
