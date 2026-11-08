import type { Locator } from '@playwright/test'
import { expect, test } from './fixtures'
import {
  doseRow,
  doseStatus,
  doseTrigger,
  drawer,
  focusInside,
  historyDateNav,
  historyRow,
  historyRows,
  toastMessage,
} from './locators'
import { datePicker, expectTime, pickTime } from './pickers'
import { addDays, insertScheduledMedicine, insertTakenRecord } from './seed'

// FE-650 steps 8 to 15 as one routine (648·W1 to W11, 649·G1, G2, S7). Interruptions at each
// step stay with their route specs.
const initialScheduleTime = '2035-06-15T14:00:00+03:00'
const today = initialScheduleTime.slice(0, 10)
const yesterday = addDays(today, -1)
const instantOn = (date: string, time: string) => new Date(`${date}T${time}:00+03:00`).toISOString()

const iron = 'Iron Routine'
const magnesium = 'Magnesium Routine'
const omega = 'Omega Routine'
const evening = 'Evening Routine'

const takenWrite = { method: 'POST', path: '/schedules', operation: 'recordTaken' } as const

test.use({
  journey: {
    auth: true,
    storage: true,
    initialScheduleTime,
    seed: async ({ db, ownerId }) => {
      const schedule = (label: string, time: string, quantity = 1) =>
        insertScheduledMedicine(db, ownerId, {
          label,
          startDate: yesterday,
          times: [{ time, quantity }],
        })
      await schedule(iron, '08:00')
      const { scheduleId: magnesiumSchedule } = await schedule(magnesium, '09:00')
      const { scheduleId: omegaSchedule } = await schedule(omega, '14:00', 2)
      await schedule(evening, '20:00')
      await insertTakenRecord(db, ownerId, {
        scheduleId: magnesiumSchedule,
        dueAt: instantOn(today, '09:00'),
        takenAt: instantOn(today, '09:20'),
        quantity: 1,
      })
      await insertTakenRecord(db, ownerId, {
        scheduleId: omegaSchedule,
        dueAt: instantOn(yesterday, '14:00'),
        takenAt: instantOn(yesterday, '14:10'),
        quantity: 2,
      })
    },
  },
})

test('the daily routine runs from Today through History to sign out', async ({ page, app }) => {
  const dialog = drawer(page)
  const nav = page.getByRole('navigation', { name: 'Primary' })
  const omegaRow = doseRow(page, instantOn(today, '14:00'))
  const ironRow = doseRow(page, instantOn(today, '08:00'))
  const magnesiumRow = doseRow(page, instantOn(today, '09:00'))
  const groupHeadings = page.getByRole('heading', { level: 3 })

  // Base UI restores focus once the drawer's exit transition finishes.
  const expectFocusReturned = async (row: Locator) => {
    await expect(dialog).toHaveCount(0)
    await expect(focusInside(row)).toHaveCount(1)
  }

  await test.step('W1: Today groups doses and offers the next one', async () => {
    await page.goto('/')
    await expect(groupHeadings).toHaveText([
      'Up next',
      'To log · 2',
      'Later today · 1',
      'Logged · 1',
    ])
    await expect(
      page.getByRole('button', { name: `Record ${omega} at 14:00 as taken` }),
    ).toBeVisible()
  })

  await test.step('W2: Taken on Up next opens the drawer without saving', async () => {
    await page.getByRole('button', { name: `Record ${omega} at 14:00 as taken` }).click()
    await expect(dialog.getByRole('button', { name: 'I took it' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await expect(dialog.getByRole('button', { name: /^Now · / })).toBeFocused()
    await expect(dialog.getByLabel(/^Amount/)).toHaveValue('2')
    await expect(doseStatus(omegaRow)).toHaveAccessibleDescription(/Due now/)
  })

  await test.step('W3: saving marks the row and locks the drawer', async () => {
    await app.worker.hold(takenWrite)
    await dialog.getByRole('button', { name: 'Save as taken' }).click()
    await expect.poll(() => app.worker.held(takenWrite)).toBe(1)
    await expect(doseStatus(omegaRow)).toHaveAccessibleDescription('Saving · Taken')
    await expect(dialog.getByRole('button', { name: 'Close dose details' })).toBeDisabled()
    await expect(dialog.getByRole('button', { name: 'Saving...' })).toBeDisabled()
    await page.keyboard.press('Escape')
    await expect(dialog).toBeVisible()
  })

  await test.step('W4: the confirmed dose moves to Logged and Up next moves on', async () => {
    await app.worker.release(takenWrite)
    await expect(toastMessage(page, `${omega} 14:00 · taken at 14:00, 2 tablets`)).toBeVisible()
    // Focus after an Up next save is asserted in the W4 tests below.
    await expect(dialog).toHaveCount(0)
    await expect(doseStatus(omegaRow)).toHaveAccessibleDescription(/Taken/)
    await expect(groupHeadings).toHaveText([
      'Up next',
      'To log · 1',
      'Later today · 1',
      'Logged · 2',
    ])
    await expect(
      page.getByRole('button', { name: `Record ${omega} at 14:00 as taken` }),
    ).toHaveCount(0)
    await expect(
      page.getByRole('button', { name: `Record ${evening} at 20:00 as taken` }),
    ).toBeVisible()
  })

  await test.step('W5: a Not logged row opens with no outcome chosen', async () => {
    await doseTrigger(ironRow, iron).click()
    await expect(dialog.getByText('Nothing is recorded until you choose and save.')).toBeVisible()
    await expect(dialog.getByRole('button', { name: 'Choose what happened' })).toBeDisabled()
  })

  await test.step('W6: Skip names the dose, records nothing else and returns focus', async () => {
    await dialog.getByRole('button', { name: 'I skipped it' }).click()
    await expect(dialog.getByRole('group', { name: `Skip ${iron}` })).toBeVisible()
    await dialog.getByRole('button', { name: 'Save as skipped' }).click()
    await expect(toastMessage(page, `${iron} 08:00 · saved as skipped`)).toBeVisible()
    await expectFocusReturned(ironRow)
    await expect(doseStatus(ironRow)).toHaveAccessibleDescription(/Skipped/)
  })

  await test.step('W7: a recorded dose opens to a summary', async () => {
    await doseTrigger(magnesiumRow, magnesium).click()
    await expect(dialog).toContainText('09:20')
    await expect(dialog).toContainText('1 tablet')
    await expect(dialog.getByRole('button', { name: 'Save changes' })).toHaveCount(0)
  })

  await test.step('W8: edit intake starts from the recorded values and returns focus', async () => {
    await dialog.getByRole('button', { name: `Edit dose for ${magnesium} at 09:00` }).click()
    await expect(dialog.getByLabel(/^Amount/)).toHaveValue('1')
    await expectTime(dialog, 'Taken time in Istanbul', '09:20')
    await pickTime(page, 'Taken time in Istanbul', '09:10')
    await dialog.getByRole('button', { name: 'Save changes' }).click()
    await expect(
      toastMessage(
        page,
        new RegExp(`^${magnesium} 09:00 · updated to taken at .*09:10, 1 tablet$`),
      ),
    ).toBeVisible()
    await expectFocusReturned(magnesiumRow)
  })

  const pastOmega = historyRow(page, yesterday, instantOn(yesterday, '14:00'))
  const pastIron = historyRow(page, yesterday, instantOn(yesterday, '08:00'))

  await test.step('W9: Previous day pushes a dated History', async () => {
    // Today's History lists doses already due; 648·W11 is a few minutes after Omega's 14:00.
    await app.setScheduleTime(`${today}T14:03:00+03:00`)
    await nav.getByRole('link', { name: 'History' }).click()
    await expect(datePicker(page, 'Choose a date')).toHaveText('Today, Fri 15 Jun')
    await historyDateNav(page)
      .getByRole('button', { name: /Previous/ })
      .click()
    await expect(page).toHaveURL(`${app.origin}/history?date=${yesterday}`)
    await expect(datePicker(page, 'Choose a date')).toHaveText('Thu 14 Jun')
    const rows = historyRows(page, yesterday)
    await expect(rows).toHaveCount(4)
    for (const [index, label] of [iron, magnesium, omega, evening].entries())
      await expect(rows.nth(index)).toContainText(label)
    await expect(pastIron).toContainText('Not logged')
    await expect(pastIron.getByRole('button')).toHaveCount(0)
  })

  await test.step('W10: correct an outcome and return focus to its row', async () => {
    await doseTrigger(pastOmega, omega).click()
    await dialog.getByRole('button', { name: `Change dose for ${omega} at 14:00` }).click()
    await expect(dialog.getByRole('button', { name: 'I took it' })).toBeDisabled()
    await dialog.getByRole('button', { name: 'I skipped it' }).click()
    await expect(dialog.getByRole('group', { name: `Skip ${omega}` })).toBeVisible()
    await dialog.getByRole('button', { name: 'Save as skipped' }).click()
    await expect(
      toastMessage(page, new RegExp(`^${omega} 14:00 · changed to skipped`)),
    ).toBeVisible()
    await expectFocusReturned(pastOmega)
    await expect(pastOmega.getByText('Skipped', { exact: true })).toBeVisible()
    await expect(pastOmega).not.toContainText('took')
  })

  await test.step('W11: Back returns to the date seen before', async () => {
    await page.goBack()
    await expect(page).toHaveURL(`${app.origin}/history`)
    await expect(datePicker(page, 'Choose a date')).toHaveText('Today, Fri 15 Jun')
    const rows = historyRows(page, today)
    await expect(rows).toHaveCount(3)
    await expect(rows.filter({ hasText: omega })).toContainText('Taken')
    await expect(rows.filter({ hasText: iron })).toContainText('Skipped')
    await expect(page.getByText(evening)).toHaveCount(0)
  })

  await test.step('G1, G2, S7: Settings signs out to a private sign-in', async () => {
    let finishSignOut = () => {}
    const signOutHeld = new Promise<void>((done) => (finishSignOut = done))
    await page.route('**/api/auth/signout', async (route) => {
      await signOutHeld
      await route.continue()
    })
    await page.getByRole('link', { name: 'Settings' }).click()
    await expect(page.getByText('Signed in with your approved Google account')).toBeVisible()
    await page.getByRole('button', { name: 'Sign out', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Signing out…' })).toBeDisabled()
    finishSignOut()
    await expect(page).toHaveURL(`${app.origin}/?reason=signed-out&returnTo=%2Fsettings`)
    await expect(
      page.getByText("You're signed out of Meddies in this browser.", { exact: true }),
    ).toBeVisible()
    await expect(page.getByRole('status')).toContainText('Your Google account stays signed in.')
    await expect(page.getByText(omega)).toHaveCount(0)
  })
})

test('W2: the scheduled choice stays hidden during the scheduled minute', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: `Record ${omega} at 14:00 as taken` }).click()
  await expect(drawer(page).getByLabel(/^Amount/)).toHaveValue('2')
  await expect(drawer(page).getByRole('button', { name: 'At 14:00' })).toHaveCount(0)
})

// Base UI returns focus after the real exit transition, so only a browser can prove this.
for (const outcome of ['taken', 'skipped'] as const) {
  test(`W4: saving ${outcome} from Up next returns focus to the saved row`, async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: `Record ${omega} at 14:00 as ${outcome}` }).click()
    await drawer(page)
      .getByRole('button', { name: `Save as ${outcome}` })
      .click()
    await expect(drawer(page)).toHaveCount(0)
    await expect(focusInside(doseRow(page, instantOn(today, '14:00')))).toHaveCount(1)
  })
}
