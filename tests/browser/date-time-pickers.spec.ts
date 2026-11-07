import { randomUUID } from 'node:crypto'
import { expect, test } from './fixtures'
import { scrollsHorizontally } from './actions'
import { calendarDay, doseRow, doseTrigger, drawer, instant } from './locators'
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
  const save = page.getByRole('button', { name: 'Save schedule' })
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
    expect((await start.boundingBox())?.height).toBeGreaterThanOrEqual(44)
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

  await test.step('choose a day by tapping', async () => {
    await start.tap()
    await calendarDay(calendar, '2035-06-17').tap()
    await expect(start).toHaveText('Sun 17 Jun')
  })

  await test.step('widen calendar days to fit narrow phones', async () => {
    const viewport = page.viewportSize()!
    // At 360px days reach the 44px target; at 320px they stay below it (recorded exception).
    for (const [width, minimum] of [
      [360, 44],
      [320, 39],
    ] as const) {
      await page.setViewportSize({ width, height: viewport.height })
      await start.click()
      const day = calendarDay(calendar, '2035-06-17')
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

  await test.step('require both parts of every dose time', async () => {
    await page.getByLabel(/^Quantity/).fill('1')
    await pickTime(page, 'Time 1', '23:45')
    await page.getByRole('button', { name: 'Add another time' }).click()
    const second = timePicker(page, 'Time 2')
    await second.hour.click()
    await page.getByRole('option', { name: '00', exact: true }).click()
    await expect(page.getByRole('listbox')).toHaveCount(0)
    await page
      .getByLabel(/^Quantity/)
      .nth(1)
      .fill('0.5')
    await save.click()
    await expect(second.minute).toBeFocused()
    await expect(page.getByText('Schedule saved for Picker Medicine.')).toHaveCount(0)
    await second.minute.click()
    await page.getByRole('option', { name: '15', exact: true }).tap()
    await expectTime(page, 'Time 2', '00:15')
    await page.screenshot({ path: testInfo.outputPath('schedule-times.png'), fullPage: true })
    expect(await scrollsHorizontally(page)).toBe(false)
  })

  await test.step('lock the pickers while saving', async () => {
    let release = () => {}
    const held = new Promise<void>((resolve) => (release = resolve))
    await page.route(
      (url) => url.pathname === '/api/schedules',
      async (route) => {
        if (route.request().method() !== 'POST') return route.fallback()
        await held
        await route.fallback()
      },
    )
    await save.click()
    await expect(start).toBeDisabled()
    await expect(timePicker(page, 'Time 1').hour).toBeDisabled()
    await expect(timePicker(page, 'Time 2').minute).toBeDisabled()
    release()
    await expect(page.getByText('Schedule saved for Picker Medicine.')).toBeVisible()
  })

  await test.step('save the picked values unchanged', async () => {
    const snapshot = await (await page.request.get('/api/schedules')).json()
    const saved = snapshot.schedules.find(
      (item: { medicineId: string }) => item.medicineId === medicineId,
    )
    expect(saved.startDate).toBe('2035-06-17')
    expect(saved.times).toEqual([
      { time: '00:15', quantity: 0.5 },
      { time: '23:45', quantity: 1 },
    ])
  })

  await test.step('record an Other intake at Istanbul time inside the drawer', async () => {
    await page.goto('/')
    await doseTrigger(page, 'Late Medicine').press('Enter')
    await dialog.getByRole('button', { name: 'I took it' }).click()
    await dialog.getByRole('button', { name: 'Other', exact: true }).click()
    const takenDate = datePicker(dialog, 'Taken date in Istanbul')
    await expect(takenDate).toHaveText('Today, Fri 15 Jun')
    await expectTime(dialog, 'Taken time in Istanbul', '23:30')
    await takenDate.click()
    const intakeCalendar = page.getByRole('dialog', { name: 'Taken date in Istanbul' })
    await expect(intakeCalendar).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(intakeCalendar).toBeHidden()
    await expect(dialog.getByRole('button', { name: 'Save as taken' })).toBeVisible()
    await pickTime(page, 'Taken time in Istanbul', '23:10')
    await expect(dialog).toContainText('10 min after scheduled')
    await dialog.getByRole('button', { name: 'Save as taken' }).click()
    await expect(instant(doseRow(page, dueAt), '2035-06-15T20:10:00.000Z')).toBeVisible()
  })
})
