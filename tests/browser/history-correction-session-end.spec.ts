import type { Page } from '@playwright/test'
import { focusWindow } from './actions'
import { expect, test, type App } from './fixtures'
import { doseTrigger, drawer, historyRow } from './locators'
import { addDays, insertScheduledMedicine, insertTakenRecord } from './seed'

// #110 step 16 on a History correction (109·X1 to X5).
const initialScheduleTime = '2035-06-15T14:00:00+03:00'
const date = addDays(initialScheduleTime.slice(0, 10), -1)
const dueAt = new Date(`${date}T14:00:00+03:00`).toISOString()
const historyPath = `/history?date=${date}`
const medicine = 'Private Omega'

const expiredUrl = `/?reason=expired&returnTo=${encodeURIComponent(historyPath)}`
const cleared = "Changes you hadn't saved were cleared."
const saveNotice = 'A save was still in progress. After signing in, check whether it was recorded.'
const correctionWrite = { method: 'POST', path: '/schedules', operation: 'correctOutcome' } as const

test.use({
  journey: {
    auth: true,
    storage: true,
    initialScheduleTime,
    seed: async ({ db, ownerId }) => {
      const { scheduleId } = await insertScheduledMedicine(db, ownerId, {
        label: medicine,
        startDate: date,
        times: [{ time: '14:00', quantity: 2 }],
      })
      await insertTakenRecord(db, ownerId, {
        scheduleId,
        dueAt,
        takenAt: new Date(`${date}T14:10:00+03:00`).toISOString(),
        quantity: 2,
      })
    },
  },
})

/** X1: an unsaved correction to Skipped, with its save one click away. */
async function startCorrection(page: Page) {
  const dialog = drawer(page)
  await page.goto(historyPath)
  await doseTrigger(historyRow(page, date, dueAt), medicine).click()
  await dialog.getByRole('button', { name: /^Change dose for/ }).click()
  await dialog.getByRole('button', { name: 'I skipped it' }).click()
  const save = dialog.getByRole('button', { name: 'Save as skipped' })
  await expect(save).toBeEnabled()
  return save
}

/** The session-end screen with a save outstanding (109·X4). */
async function expectSaveInProgressSignIn(page: Page, app: App) {
  await expect(page).toHaveURL(`${app.origin}${expiredUrl}&notice=save-in-progress`)
  await expect(page.getByText('Your session ended.', { exact: true })).toBeVisible()
  await expect(page.getByRole('status')).toContainText(saveNotice)
  await expect(page.getByText(medicine)).toHaveCount(0)
  await expect(page.getByText(/cancel|lost|not saved/i)).toHaveCount(0)
  expect(page.url()).not.toContain('Omega')
}

/** X3, X5: back at the date with no drawer, showing what the server has. */
async function expectDateAfterSignIn(page: Page, app: App, outcome: 'Taken' | 'Skipped') {
  await app.restoreSession()
  await page.reload()
  await expect(page).toHaveURL(`${app.origin}${historyPath}`)
  const row = historyRow(page, date, dueAt)
  await expect(row.getByText(new RegExp(`^${outcome}`))).toBeVisible()
  await expect(row.getByText(outcome === 'Taken' ? 'Skipped' : /^Taken/)).toHaveCount(0)
  await expect(drawer(page)).toHaveCount(0)
}

test('X1 to X3: session end clears an unsaved correction and returns to the old outcome', async ({
  page,
  app,
}) => {
  await startCorrection(page)

  await app.expireSession()
  await focusWindow(page)

  await expect(page).toHaveURL(`${app.origin}${expiredUrl}`)
  await expect(page.getByRole('heading', { name: 'Good to see you', exact: true })).toBeFocused()
  await expect(page.getByText('Your session ended.', { exact: true })).toBeVisible()
  await expect(page.getByRole('status')).toContainText(cleared)
  await expect(page.getByRole('status')).not.toContainText(saveNotice)
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByText(medicine)).toHaveCount(0)

  await expectDateAfterSignIn(page, app, 'Taken')
})

test('X4, X5: a correction in flight that landed shows the corrected outcome after sign-in', async ({
  page,
  app,
}) => {
  const save = await startCorrection(page)
  // The Worker applies the correction; only its response is held.
  await app.worker.hold(correctionWrite)
  await save.click()
  await expect.poll(() => app.worker.held(correctionWrite)).toBe(1)

  await app.expireSession()
  await focusWindow(page)

  await expectSaveInProgressSignIn(page, app)
  await app.worker.release(correctionWrite)
  await expectDateAfterSignIn(page, app, 'Skipped')
})

test('X4, X5: a correction refused by the expired session keeps the old outcome', async ({
  page,
  app,
}) => {
  const save = await startCorrection(page)

  await app.expireSession()
  await save.click()

  await expect(page.getByRole('heading', { name: 'Good to see you', exact: true })).toBeVisible()
  await expectSaveInProgressSignIn(page, app)
  await expectDateAfterSignIn(page, app, 'Taken')
})
