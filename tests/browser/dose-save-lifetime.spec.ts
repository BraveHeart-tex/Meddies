import { randomUUID } from 'node:crypto'
import type { Page } from '@playwright/test'
import { focusWindow } from './actions'
import { expect, test } from './fixtures'
import { doseRow, doseStatus, doseTrigger, drawer, toastMessage } from './locators'
import { insertScheduledMedicine } from './seed'

// FE-674: dose saves and drawer drafts belong to the session, not to Today or the drawer.
const initialScheduleTime = '2035-06-15T12:00:00+03:00'
const today = initialScheduleTime.slice(0, 10)
const dueAt = new Date(`${today}T08:00:00+03:00`).toISOString()
const label = 'Lifetime Medicine'
const scheduleId = randomUUID()
const takenWrite = { method: 'POST', path: '/schedules', operation: 'recordTaken' } as const

test.use({
  journey: {
    auth: true,
    storage: true,
    initialScheduleTime,
    seed: async ({ db, ownerId }) => {
      await insertScheduledMedicine(db, ownerId, {
        label,
        startDate: today,
        times: [{ time: '08:00', quantity: 1 }],
        scheduleId,
      })
    },
  },
})

/** Enters Today by client navigation, so leaving and returning keep the session in memory. */
async function openToday(page: Page) {
  await page.goto('/medications')
  await page.getByRole('link', { name: 'Today', exact: true }).click()
  await expect(doseStatus(doseRow(page, dueAt))).toHaveAccessibleDescription('Not logged')
}

async function startTaken(page: Page, amount: string) {
  await doseTrigger(page, label).click()
  await drawer(page).getByRole('button', { name: 'I took it' }).click()
  const field = drawer(page).getByLabel(/^Amount/)
  await field.fill(amount)
  return field
}

const leaveForMedications = (page: Page) =>
  page.getByRole('link', { name: 'Medications', exact: true }).first().click()
const returnToToday = (page: Page) =>
  page.getByRole('link', { name: 'Today', exact: true }).first().click()

test('F1: leaving Today keeps a pending save and confirms wherever the user is', async ({
  page,
  app,
}) => {
  await openToday(page)
  await startTaken(page, '2')
  await app.worker.hold(takenWrite)
  await drawer(page).getByRole('button', { name: 'Save as taken' }).click()
  await expect.poll(() => app.worker.held(takenWrite)).toBe(1)
  // The modal drawer covers the nav, so leave the way a phone does: Back.
  await page.goBack()
  await expect(page).toHaveURL(`${app.origin}/medications`)
  await app.worker.release(takenWrite)
  await expect(toastMessage(page, `${label} 08:00 · taken at 12:00, 2 tablets`)).toBeVisible()
  await returnToToday(page)
  await expect(doseStatus(doseRow(page, dueAt))).toHaveAccessibleDescription(/Taken/)
})

test('F6: an unconfirmed save stays on its row across navigation and retries the same request', async ({
  page,
  app,
}) => {
  const puts: string[] = []
  page.on('request', (request) => {
    if (request.method() === 'PUT' && request.url().endsWith('/api/schedules'))
      puts.push(request.postData()!)
  })
  await openToday(page)
  await startTaken(page, '2')
  await app.worker.fail(takenWrite, 503)
  await drawer(page).getByRole('button', { name: 'Save as taken' }).click()
  await expect(drawer(page).getByText('Save could not be confirmed.')).toBeVisible()
  await drawer(page).getByRole('button', { name: 'Close dose details' }).click()
  await expect(drawer(page)).toHaveCount(0)
  const row = doseRow(page, dueAt)
  await expect(doseStatus(row)).toHaveAccessibleDescription('Not confirmed')
  await expect(row).toContainText('Taken at 12:00, 2 tablets · open to retry')
  await leaveForMedications(page)
  await returnToToday(page)
  await expect(doseStatus(row)).toHaveAccessibleDescription('Not confirmed')
  await app.worker.clear()
  await doseTrigger(page, label).click()
  await expect(drawer(page).getByLabel(/^Amount/)).toHaveValue('2')
  await drawer(page).getByRole('button', { name: 'Retry saving as taken' }).click()
  await expect(toastMessage(page, `${label} 08:00 · taken at 12:00, 2 tablets`)).toBeVisible()
  await expect(doseStatus(row)).toHaveAccessibleDescription(/Taken/)
  expect(puts).toHaveLength(2)
  expect(puts[1]).toBe(puts[0])
})

test('F5: focus and reconnect recheck an unconfirmed save; it confirms once away from Today', async ({
  page,
}) => {
  await openToday(page)
  // The write lands but its response is lost, and so are the receipt check and the focus
  // recheck; reconnect then finds the record.
  let lostReads = 0
  let loseReads = 0
  await page.route('**/api/schedules', async (route) => {
    const method = route.request().method()
    if (method === 'PUT') {
      await route.fetch()
      loseReads = 2
      return route.abort('connectionfailed')
    }
    if (method === 'GET' && loseReads > 0) {
      loseReads--
      lostReads++
      return route.abort('connectionfailed')
    }
    return route.fallback()
  })
  await startTaken(page, '1')
  await drawer(page).getByRole('button', { name: 'Save as taken' }).click()
  await expect(drawer(page).getByText('Save could not be confirmed.')).toBeVisible()
  await drawer(page).getByRole('button', { name: 'Close dose details' }).click()
  await expect(doseStatus(doseRow(page, dueAt))).toHaveAccessibleDescription('Not confirmed')
  await leaveForMedications(page)
  await focusWindow(page)
  await expect.poll(() => lostReads).toBe(2)
  await page.context().setOffline(true)
  await page.context().setOffline(false)
  const confirmation = toastMessage(
    page,
    `${label} 08:00 · already saved as taken at 12:00, 1 tablet`,
  )
  await expect(confirmation).toBeVisible()
  await focusWindow(page)
  await returnToToday(page)
  await expect(doseStatus(doseRow(page, dueAt))).toHaveAccessibleDescription(/Taken/)
  await expect(confirmation).toHaveCount(1)
})

test('F8 and drafts: details survive navigation, a record elsewhere keeps them, dismissal discards', async ({
  page,
  app,
}) => {
  const browserWrites: string[] = []
  page.on('request', (request) => {
    if (request.method() === 'PUT' && request.url().endsWith('/api/schedules'))
      browserWrites.push(request.url())
  })
  await openToday(page)
  await startTaken(page, '3')
  await page.goBack()
  await expect(page).toHaveURL(`${app.origin}/medications`)
  await page.goForward()
  await expect(drawer(page).getByRole('button', { name: 'I took it' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  // A recorded dose also renders the hidden Edit intake form.
  const amount = drawer(page)
    .getByLabel(/^Amount/)
    .filter({ visible: true })
  await expect(amount).toHaveValue('3')
  await expect(drawer(page).getByText('Unsaved details from earlier.')).toBeVisible()

  await app.api('PUT', '/api/schedules', {
    outcome: 'Taken',
    scheduleId,
    dueAt,
    takenAt: new Date(`${today}T11:55:00+03:00`).toISOString(),
    quantity: 1,
  })
  await focusWindow(page)
  await expect(
    drawer(page).getByText(
      'This dose was recorded as taken at 11:55 while your form was open. Your draft is still here. Review the outcome before saving.',
    ),
  ).toBeVisible()
  await expect(amount).toHaveValue('3')
  expect(browserWrites, 'nothing saves without Save').toHaveLength(0)

  await drawer(page).getByRole('button', { name: 'Close dose details' }).click()
  await expect(drawer(page)).toHaveCount(0)
  await leaveForMedications(page)
  await returnToToday(page)
  await expect(doseStatus(doseRow(page, dueAt))).toHaveAccessibleDescription(/Taken/)
  await expect(drawer(page)).toHaveCount(0)
})
