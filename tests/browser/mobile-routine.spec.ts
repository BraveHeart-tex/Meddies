import { expect, test } from './fixtures'
import { datePicker, expectTime, pickDate, pickTime } from './pickers'
import { focusWindow, waitForClientRouter } from './actions'
import { doseRow, doseTrigger, historyRow, historyRows, instant, drawer } from './locators'
import { chooseMedicineType } from './drawers'

const initialScheduleTime = '2035-06-15T09:00:00+03:00'
const today = initialScheduleTime.slice(0, 10)
const todayLabel = 'Today, Fri 15 Jun'
const time = '09:05'
const dueAt = new Date(`${today}T${time}:00+03:00`).toISOString()
const takenAt = new Date(initialScheduleTime).toISOString()

test.use({ journey: { auth: true, storage: true, initialScheduleTime } })

// Allowed reasons: Back, Forward and reload behavior; data consistency across routes.
test('set up, record, correct and recover a routine on a phone', async ({ page, app }) => {
  let pageRequests = 0
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === '/medications') pageRequests++
  })
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
    // The Taken badge also shows the intake time.
    await expect(scheduled.getByText(new RegExp(`^${status}`))).toBeVisible()
  }

  await test.step('open signed-in Today and save a medicine', async () => {
    await page.goto('/')
    await expect(nav).toBeVisible()
    // Hard load: a cold client has no cached list, so its fallback is a skeleton and this empty
    // state proves the page landed. A cached fallback shows it on a pending route, where Add
    // intentionally uses router navigation.
    await page.goto('/medications')
    await expect(page.getByRole('heading', { name: 'Medications', exact: true })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'No medications here yet' })).toBeVisible()
    // A click before hydration would be a document request.
    await waitForClientRouter(page)
    pageRequests = 0
    await page.getByRole('link', { name: 'Add a medication' }).click()
    await page.getByLabel('Name', { exact: true }).fill('Routine Medicine')
    await page.getByLabel(/^Strength/).fill('5 mg')
    await chooseMedicineType(page, 'Tablet')
    await page.getByRole('button', { name: 'Save medication' }).press('Enter')
    await expect(page.getByText('Routine Medicine saved.')).toBeVisible()
    expect(pageRequests, 'the saved handoff makes no document or RSC request').toBe(0)
    await expect(page.getByRole('heading', { name: 'Routine Medicine' })).toBeFocused()
    await expect(page.getByRole('link', { name: 'Set schedule', exact: true })).toHaveCount(1)
    await page.getByRole('link', { name: 'Done for now' }).click()
    await expect(
      page.getByRole('link', { name: 'View details for Routine Medicine' }),
    ).toBeFocused()
    await page.goBack()
    // The saved medicine replaces Add: Back returns to the list, never the submitted form.
    await page.goBack()
    await expect(page).toHaveURL(app.origin + '/medications')
    await page.goForward()
    await expect(page.getByRole('button', { name: 'Save medication' })).toHaveCount(0)
    // Reopen a just-saved detail so reload proves the transient handoff is gone.
    await page.reload()
    await expect(page.getByText('Routine Medicine saved.')).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'Done for now' })).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'Set schedule', exact: true })).toBeVisible()
    // #110 steps 2 to 7: finish later, then return from the list for first setup.
    await page.getByRole('link', { name: 'Medications', exact: true }).first().click()
    await page.getByRole('link', { name: 'View details for Routine Medicine' }).click()
    const setSchedule = page.getByRole('link', { name: 'Set schedule', exact: true })
    await expect(setSchedule).toHaveAttribute('href', /^\/medications\?schedule=[\w-]+/)
    await setSchedule.press('Enter')
    await expect(page.getByRole('heading', { name: 'Routine Medicine' })).toBeVisible()
  })

  await test.step('retry an uncertain schedule save without losing setup', async () => {
    pageRequests = 0
    await pickDate(page, 'Start date', today)
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
    await expect(page.getByText('That might not have saved.')).toBeVisible()
    await expectTime(page, 'Time 1', time)
    await page.getByRole('button', { name: 'Try saving schedule again' }).press('Enter')
    await expect(page.getByText('Schedule saved for Routine Medicine.')).toBeVisible()
    expect(pageRequests, 'the schedule handoff makes no document or RSC request').toBe(0)
    // The saved message shows before the replace to ?medicine=ID; reloading earlier reopens setup.
    await expect(page).toHaveURL(/[?&]medicine=/)
    await expect(page.getByRole('heading', { name: 'Routine Medicine' })).toBeFocused()
    await expect(page.getByText('First dose: today at 09:05.')).toBeVisible()
    await page.goBack()
    await expect(page).toHaveURL(/[?&]medicine=/)
    await expect(page.getByRole('button', { name: 'Save schedule' })).toHaveCount(0)
    await page.goForward()
    await page.reload()
    const scheduleCard = page.getByRole('region', { name: 'Schedule', exact: true })
    await expect(scheduleCard.getByText(time, { exact: true })).toBeVisible()
    await expect(scheduleCard.getByText('1 tablet', { exact: true })).toBeVisible()
    await expect(scheduleCard).not.toContainText('5 mg')
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
    await expect(page.getByText('Nothing due yet today')).toBeVisible()
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
    await dialog.getByRole('button', { name: /^Change dose for/ }).click()
    await dialog.getByRole('button', { name: 'I skipped it' }).click()
    await dialog.getByRole('button', { name: 'Save as skipped' }).click()
    await expectHistoryDose('Skipped')
    await page.reload()
    await expectHistoryDose('Skipped')
  })

  await test.step('save another medicine without a schedule and reload', async () => {
    await nav.getByRole('link', { name: 'Medications' }).click()
    await page.getByRole('link', { name: 'Add a medication' }).click()
    await page.getByLabel('Name', { exact: true }).fill('Evening Vitamin')
    await chooseMedicineType(page, 'Capsule')
    await page.getByRole('button', { name: 'Save medication' }).press('Enter')
    await expect(page.getByText('Evening Vitamin saved.')).toBeVisible()
    await page.reload()
    await expect(page.getByText('Evening Vitamin saved.')).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'Done for now' })).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'Set schedule', exact: true })).toBeVisible()
    await page.getByRole('link', { name: 'Medications', exact: true }).first().click()
    await expect(page).toHaveURL(/\/medications$/)
    await page.getByRole('link', { name: 'View details for Evening Vitamin' }).click()
    await expect(page.getByRole('heading', { name: 'Evening Vitamin' })).toBeVisible()
    await expect(page.getByRole('region', { name: 'Schedule', exact: true })).toContainText(
      'No schedule yet',
    )
  })

  await test.step('recover from session expiry on Settings', async () => {
    await page.getByRole('link', { name: 'Settings' }).click()
    await expect(page.getByText('Approved', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible()
    await app.expireSession()
    await focusWindow(page)
    await expect(page.getByRole('heading', { name: 'Good to see you', exact: true })).toBeVisible()
    await expect(page.getByText('Your session ended.', { exact: true })).toBeVisible()
    await expect(page).toHaveURL(/returnTo=%2Fsettings/)
  })
})
