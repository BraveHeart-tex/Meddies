import { randomUUID } from 'node:crypto'
import { expect, test } from './fixtures'
import { clickTwiceSynchronously } from './actions'
import { pickDate, pickTime } from './pickers'
import { doseRow, doseStatus, doseTrigger, drawer, instant, toastMessage } from './locators'
import { insertScheduledMedicine, insertTakenRecord } from './seed'

const initialScheduleTime = '2035-06-15T12:00:00+03:00'
const today = initialScheduleTime.slice(0, 10)
const dueAt = (time: string) => new Date(`${today}T${time}:00+03:00`).toISOString()
const mid = dueAt('10:00')
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
        times: ['08:00', '09:00', '10:00', '11:00'].map((time) => ({ time, quantity: 1 })),
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

test('record and edit intakes: validation, uncertain saves, double submit and conflicts', async ({
  page,
  app,
}) => {
  const dialog = drawer(page)
  const amount = dialog.getByLabel(/^Amount/)
  const saveAsTaken = dialog.getByRole('button', { name: 'Save as taken' })
  const openTaken = async (time: string) => {
    await doseTrigger(doseRow(page, dueAt(time))).press('Enter')
    await expect(dialog.getByRole('heading', { name: 'Intake Medicine' })).toBeFocused()
    await dialog.getByRole('button', { name: 'I took it' }).click()
  }

  await test.step('inline errors focus the first invalid control and keep values', async () => {
    await page.goto('/')
    await openTaken('08:00')
    await expect(dialog.getByText('Scheduled 08:00 today')).toBeVisible()
    await expect(dialog.getByRole('button', { name: 'Now · 12:00' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await amount.fill('')
    await dialog.getByRole('button', { name: 'Other', exact: true }).click()
    await pickDate(page, 'Taken date in Istanbul', today)
    await pickTime(page, 'Taken time in Istanbul', '13:00')
    await saveAsTaken.click()
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

  await test.step('a save that never arrived is checked, kept and retried', async () => {
    let fail = true
    await page.route(
      (url) => url.pathname === '/api/schedules',
      async (route) => {
        if (!fail || route.request().method() !== 'PUT') return route.fallback()
        fail = false
        await route.abort('connectionfailed')
      },
    )
    await saveAsTaken.click()
    await expect(dialog.getByText('Save could not be confirmed.')).toBeVisible()
    await expect(dialog.getByText(/Meddies checked and found no record yet/)).toBeVisible()
    await expect(dialog.getByText('Not confirmed')).toBeVisible()
    await expect(amount).toHaveValue('1½')
    await amount.fill('2')
    await expect(dialog.getByText(/Changing details starts a new save/)).toBeVisible()
    await expect(saveAsTaken).toBeVisible()
    await amount.fill('1.5')
    await dialog.getByRole('button', { name: 'Retry saving as taken' }).click()
    await expect(
      toastMessage(page, 'Intake Medicine 08:00 · taken at 11:30, 1½ tablets'),
    ).toBeVisible()
    await expect(doseStatus(doseRow(page, dueAt('08:00')))).toHaveAccessibleDescription(/Taken/)
    await expect(dialog).toHaveCount(0)
    await page.unrouteAll()
  })

  await test.step('a stored save whose response was lost is found by the check', async () => {
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
    await openTaken('09:00')
    await saveAsTaken.click()
    await expect(dialog).toHaveCount(0)
    await expect(
      toastMessage(page, 'Intake Medicine 09:00 · taken at 12:00, 1 tablet'),
    ).toBeVisible()
    await expect(page.getByText(/was already recorded/)).toHaveCount(0)
    await expect(doseStatus(doseRow(page, dueAt('09:00')))).toHaveAccessibleDescription(/Taken/)
    await page.unrouteAll()
  })

  await test.step('a double submit sends one save', async () => {
    const puts: string[] = []
    page.on('request', (request) => {
      if (request.method() === 'PUT' && new URL(request.url()).pathname === '/api/schedules')
        puts.push(request.url())
    })
    await openTaken('11:00')
    await clickTwiceSynchronously(saveAsTaken)
    await expect(toastMessage(page, /^Intake Medicine 11:00 · taken at 12:00/)).toBeVisible()
    expect(puts).toHaveLength(1)
  })

  await test.step('an intake changed elsewhere while editing is not overwritten', async () => {
    const row = doseRow(page, mid)
    await doseTrigger(row).press('Enter')
    await dialog.getByRole('button', { name: /^Edit intake/ }).click()
    await amount.fill('2')
    await app.api('PATCH', '/api/schedules', {
      actionId: randomUUID(),
      expectedRevision: 0,
      expectedOutcome: 'Taken',
      outcome: 'Taken',
      takenAt: preciseTakenAt,
      quantity: 3,
      scheduleId,
      dueAt: mid,
    })
    await dialog.getByRole('button', { name: 'Save intake changes' }).click()
    await expect(page.getByText('This dose changed elsewhere.')).toBeVisible()
    await expect(dialog).toHaveCount(0)
    await expect(row).toContainText('took 3 tablets')
  })

  await test.step('editing only the amount keeps the exact recorded instant', async () => {
    const row = doseRow(page, mid)
    await doseTrigger(row).press('Enter')
    await dialog.getByRole('button', { name: /^Edit intake/ }).click()
    await expect(amount).toHaveValue('3')
    await amount.fill('2')
    await dialog.getByRole('button', { name: 'Save intake changes' }).click()
    await expect(dialog).toHaveCount(0)
    await expect(
      toastMessage(page, 'Intake Medicine 10:00 · intake changed to 10:05, 2 tablets'),
    ).toBeVisible()
    await expect(row).toContainText('took 2 tablets')
    await expect(instant(row, preciseTakenAt)).toBeVisible()
  })
})
