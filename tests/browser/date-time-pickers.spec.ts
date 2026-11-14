import { randomUUID } from 'node:crypto'
import { expect, test } from './fixtures'
import { scrollsHorizontally } from './actions'
import { calendarDay, doseRow, doseTrigger, drawer, instant, takenDay } from './locators'
import { datePicker, expectTime, pickDate, pickTime, timePicker } from './pickers'
import { insertScheduledMedicine } from './seed'

// Istanbul is at 23:30 on 15 June while the device, at UTC+14, is already on 16 June.
const initialScheduleTime = '2035-06-15T23:30:00+03:00'
const today = '2035-06-15'
const dueAt = new Date(`${today}T23:00:00+03:00`).toISOString()

test.use({
  hasTouch: true,
  timezoneId: 'Pacific/Kiritimati',
  journey: {
    auth: true,
    storage: true,
    initialScheduleTime,
    seed: ({ db, ownerId }) =>
      insertScheduledMedicine(db, ownerId, {
        label: 'Late Medicine',
        startDate: today,
        times: [{ time: '23:00', quantity: 1 }],
      }),
  },
})

test('pick schedule dates, dose times and intake in Istanbul time from another timezone', async ({
  page,
  app,
}, testInfo) => {
  const medicineId = randomUUID()
  const start = datePicker(page, 'Start date')
  const calendar = page.getByRole('dialog', { name: 'Start date' })
  const dialog = drawer(page)

  await test.step('default the start date to Istanbul today, not the device date', async () => {
    await app.api('POST', '/api/medicines', {
      id: medicineId,
      label: 'Picker Medicine',
      strength: '5 mg',
      unit: 'tablet',
    })
    await page.goto(`/medications?schedule=${medicineId}`)
    await expect(start).toHaveText('Today, Fri 15 Jun')
  })

  await test.step('open with the keyboard, dismiss with Escape and return focus', async () => {
    await start.focus()
    await start.press('Enter')
    await expect(calendar).toBeVisible()
    await expect(calendarDay(calendar, today)).toBeFocused()
    await expect(calendarDay(calendar, '2035-06-14')).toBeDisabled()
    await page.screenshot({
      path: testInfo.outputPath('schedule-start-calendar.png'),
      animations: 'disabled',
    })
    await page.keyboard.press('Escape')
    await expect(calendar).toBeHidden()
    await expect(start).toBeFocused()
  })

  await test.step('move a day with the arrow keys and choose it', async () => {
    await start.press('Enter')
    await expect(calendarDay(calendar, today)).toBeFocused()
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('Enter')
    await expect(calendar).toBeHidden()
    await expect(start).toHaveText('Sat 16 Jun')
    await expect(start).toBeFocused()
  })

  await test.step('choose a day and a time part by tapping', async () => {
    await start.tap()
    await calendarDay(calendar, '2035-06-17').tap()
    await expect(start).toHaveText('Sun 17 Jun')
    const { minute } = timePicker(page, 'Time 1')
    await minute.click()
    await page.getByRole('option', { name: '15', exact: true }).tap()
    await expect(minute).toHaveText('15')
  })

  await test.step('record an Other intake at Istanbul time inside the drawer', async () => {
    await page.goto('/')
    await doseTrigger(page, 'Late Medicine').press('Enter')
    await dialog.getByRole('button', { name: 'I took it' }).click()
    await dialog.getByRole('button', { name: 'Other', exact: true }).click()
    await expectTime(dialog, 'Taken time in Istanbul', '23:30')
    await takenDay(dialog, today).click()
    await pickTime(page, 'Taken time in Istanbul', '23:10')
    await expect(dialog).toContainText('10 min after scheduled')
    await dialog.getByRole('button', { name: 'Save as taken' }).click()
    await expect(instant(doseRow(page, dueAt), '2035-06-15T20:10:00.000Z')).toBeVisible()
  })
})

test('calendar day widths and date trigger size @visual', async ({ page, app }) => {
  const medicineId = randomUUID()
  await app.api('POST', '/api/medicines', {
    id: medicineId,
    label: 'Visual Picker Medicine',
    strength: '5 mg',
    unit: 'tablet',
  })
  await page.goto(`/medications?schedule=${medicineId}`)
  const start = datePicker(page, 'Start date')
  const calendar = page.getByRole('dialog', { name: 'Start date' })
  await expect(start).toHaveText('Today, Fri 15 Jun')
  expect((await start.boundingBox())?.height).toBeGreaterThanOrEqual(44)

  await test.step('widen calendar days to fit narrow phones', async () => {
    const viewport = page.viewportSize()!
    // At 360px days reach the 44px target; at 320px they stay below it (recorded exception).
    for (const [width, minimum] of [
      [360, 44],
      [320, 39],
    ] as const) {
      await page.setViewportSize({ width, height: viewport.height })
      await start.click()
      const day = calendarDay(calendar, today)
      await expect(day).toBeVisible()
      const box = (await day.boundingBox())!
      expect(box.width, `day width at ${width}px`).toBeGreaterThanOrEqual(minimum)
      const popup = (await calendar.boundingBox())!
      expect(popup.x).toBeGreaterThanOrEqual(0)
      expect(popup.x + popup.width).toBeLessThanOrEqual(width)
      expect(await scrollsHorizontally(page)).toBe(false)
      await page.keyboard.press('Escape')
      await expect(calendar).toBeHidden()
    }
    await page.setViewportSize(viewport)
  })
})
