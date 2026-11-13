import { randomUUID } from 'node:crypto'
import type { Page } from '@playwright/test'
import { waitForClientLink, waitForClientRouter } from './actions'
import { expect, test } from './fixtures'
import { doseRow, doseStatus, doseTrigger, drawer, toastMessage } from './locators'
import { insertScheduledMedicine } from './seed'

// #127: dose saves and drawer drafts belong to the session, not to Today or the drawer.
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
  await waitForClientRouter(page)
  const todayLink = page.getByRole('link', { name: 'Today', exact: true })
  await waitForClientLink(todayLink)
  await todayLink.click()
  await expect(doseStatus(doseRow(page, dueAt))).toHaveAccessibleDescription('Not logged')
}

async function startTaken(page: Page, amount: string) {
  await doseTrigger(page, label).click()
  await drawer(page).getByRole('button', { name: 'I took it' }).click()
  const field = drawer(page).getByLabel(/^Amount/)
  await field.fill(amount)
  return field
}

async function returnToToday(page: Page) {
  const link = page.getByRole('link', { name: 'Today', exact: true })
  await waitForClientLink(link)
  await link.click()
}

// Allowed reasons: Back and Forward restore a session draft; navigation preserves a pending save.
test('Back and Forward restore the drawer draft; a pending save confirms after leaving Today', async ({
  page,
  app,
}) => {
  // A document load intentionally loses session memory. Diagnose it before draft assertions.
  const documents: string[] = []
  page.on('request', (request) => {
    if (request.isNavigationRequest() && request.frame() === page.mainFrame())
      documents.push(request.url())
  })
  const expectSessionDocument = (stage: string) =>
    expect(documents, `${stage} keeps the session document`).toEqual([`${app.origin}/medications`])
  await openToday(page)
  expectSessionDocument('Today entry')
  await startTaken(page, '2')
  await page.goBack()
  await expect(page).toHaveURL(`${app.origin}/medications`)
  expectSessionDocument('Back')
  await page.goForward()
  await expect(page).toHaveURL(`${app.origin}/`)
  expectSessionDocument('Forward')
  await expect(drawer(page).getByRole('button', { name: 'I took it' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await expect(drawer(page).getByLabel(/^Amount/)).toHaveValue('2')
  await expect(
    drawer(page).getByText('Pick up where you left off. Your details are still here.'),
  ).toBeVisible()
  await app.worker.hold(takenWrite)
  await drawer(page).getByRole('button', { name: 'Save as taken' }).click()
  await expect.poll(() => app.worker.held(takenWrite)).toBe(1)
  await expect(doseRow(page, dueAt)).toContainText('Saving · Taken')
  // The modal drawer covers the nav, so leave the way a phone does: Back.
  await page.goBack()
  await expect(page).toHaveURL(`${app.origin}/medications`)
  expectSessionDocument('Back during the Pending save')
  await app.worker.release(takenWrite)
  await expect(toastMessage(page, `${label} 08:00 · taken at 12:00, 2 tablets`)).toBeVisible()
  await returnToToday(page)
  await expect(doseStatus(doseRow(page, dueAt))).toHaveAccessibleDescription(/Taken/)
  expectSessionDocument('Return after confirmation')
})
