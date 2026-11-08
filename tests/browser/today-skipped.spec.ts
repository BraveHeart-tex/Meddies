import { randomUUID } from 'node:crypto'
import { expect, test } from './fixtures'
import { scrollsHorizontally } from './actions'
import { doseRow, doseStatus, doseTrigger, drawer, toastMessage } from './locators'

// The dose is due one minute after the frozen scheduling clock, so it stays today's dose.
const initialScheduleTime = '2035-06-15T09:00:00+03:00'
const today = initialScheduleTime.slice(0, 10)

test.use({ journey: { auth: true, storage: true, initialScheduleTime } })

test('skip a dose from the keyboard and correct it back to Taken', async ({
  page,
  app,
}, testInfo) => {
  const label = 'M'.repeat(120)
  const dialog = drawer(page)
  const skipWrite = { method: 'POST', path: '/schedules', operation: 'recordSkipped' } as const
  const correctionWrite = {
    method: 'POST',
    path: '/schedules',
    operation: 'correctOutcome',
  } as const
  const row = doseRow(page, new Date(`${today}T09:01:00+03:00`).toISOString())

  await test.step('seed authenticated fixtures', async () => {
    const medicineId = randomUUID()
    await app.api('POST', '/api/medicines', {
      id: medicineId,
      label,
      strength: null,
      unit: 'tablet',
    })
    await app.api('POST', '/api/schedules', {
      id: randomUUID(),
      medicineId,
      startDate: today,
      times: [{ time: '09:01', quantity: 1 }],
    })
  })

  await test.step('open Today and show skip confirmation with keyboard', async () => {
    await page.goto('/')
    const trigger = doseTrigger(page, label)
    await trigger.press('Enter')
    await dialog.getByRole('button', { name: 'I skipped it' }).press('Enter')
    await expect(dialog.getByRole('button', { name: 'Save as skipped' })).toBeVisible()
    await expect(dialog.getByRole('group', { name: `Skip ${label}` })).toBeVisible()
    await page.keyboard.press('Escape')
    // Base UI returns focus to the opener once the drawer's exit transition finishes.
    await expect(dialog).toHaveCount(0)
    await expect(trigger).toBeFocused()
    await page.keyboard.press('Enter')
    await dialog.getByRole('button', { name: 'I skipped it' }).press('Enter')
    await expect(dialog.getByRole('button', { name: 'Save as skipped' })).toBeVisible()
    await page.keyboard.press('Shift+Tab')
    await expect(dialog.getByRole('button', { name: 'Save as skipped' })).toBeFocused()
    await app.worker.hold(skipWrite)
    await page.keyboard.press('Enter')
    await expect.poll(() => app.worker.held(skipWrite)).toBe(1)
    await expect(doseStatus(row)).toHaveAccessibleDescription('Saving · Skipped')
    await expect(
      page.getByRole('heading', { name: 'Later today · 1', includeHidden: true }),
    ).toBeAttached()
    await expect(page.getByRole('heading', { name: 'Up next', includeHidden: true })).toBeAttached()
    await page.screenshot({ path: testInfo.outputPath('today-saving-skip.png') })
    await app.worker.release(skipWrite)
  })

  await test.step('confirm skipped outcome', async () => {
    await expect(toastMessage(page, `${label} 09:01 · saved as skipped`)).toBeVisible()
    expect(
      await scrollsHorizontally(page),
      'the confirmation must fit the viewport with a 120-character unbroken name',
    ).toBe(false)
  })

  await test.step('reload and verify persisted skipped outcome', async () => {
    await page.reload()
    await expect(
      doseStatus(row),
      'skip outcome must remain visible after reload',
    ).toHaveAccessibleDescription(/Skipped\s+\d\d:\d\d/)
    await expect(row, 'persisted dose must remain tied to seeded medicine').toContainText(label)
  })

  await test.step('correct the Today outcome back to Taken', async () => {
    await doseTrigger(row, label).press('Enter')
    await dialog.getByRole('button', { name: /^Change dose for/ }).press('Enter')
    await dialog.getByRole('button', { name: 'I took it' }).press('Enter')
    await app.worker.hold(correctionWrite)
    await dialog.getByRole('button', { name: 'Save changes' }).press('Enter')
    await expect.poll(() => app.worker.held(correctionWrite)).toBe(1)
    await expect(doseStatus(row)).toHaveAccessibleDescription('Saving · Taken')
    await expect(
      page.getByRole('heading', { name: 'Logged · 1', includeHidden: true }),
    ).toBeAttached()
    await app.worker.release(correctionWrite)
    await expect(toastMessage(page, /· changed to taken at \d\d:\d\d, 1 tablet$/)).toBeVisible()
    await expect(doseStatus(row)).toHaveAccessibleDescription(/Taken/)
    await page.screenshot({ path: testInfo.outputPath('today-corrected.png') })
    await page.reload()
    await expect(doseStatus(row)).toHaveAccessibleDescription(/Taken/)
  })
})
