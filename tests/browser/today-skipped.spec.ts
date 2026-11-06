import { randomUUID } from 'node:crypto'
import { expect, test } from './fixtures'
import { scrollsHorizontally } from './actions'
import { doseStatus, doseTrigger, drawer } from './locators'
import { istanbulDate } from './seed'

test.use({ journey: { auth: true, storage: true } })

// Uses the real clock: the fixture schedule is one minute ahead, so the journey reports a
// fixture limit during the final minute before Europe/Istanbul midnight.
test('skip a dose from the keyboard and correct it back to Taken', async ({
  page,
  app,
}, testInfo) => {
  const label = 'M'.repeat(120)
  const dialog = drawer(page)
  const row = page.getByRole('list', { name: "Today's doses" }).getByRole('listitem')
  const outcome = (text: string) =>
    page.getByRole('main').getByRole('status').filter({ hasText: text })

  await test.step('seed authenticated fixtures', async () => {
    const medicineId = randomUUID()
    await app.api('POST', '/api/medicines', {
      id: medicineId,
      label,
      strength: null,
      unit: 'tablet',
    })
    const today = istanbulDate(new Date())
    const future = new Date(Date.now() + 60_000)
    expect(
      istanbulDate(future),
      'today-skipped fixture needs at least one minute before Istanbul midnight',
    ).toBe(today)
    const time = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Istanbul',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).format(future)
    await app.api('POST', '/api/schedules', {
      id: randomUUID(),
      medicineId,
      startDate: today,
      times: [{ time, quantity: 1 }],
    })
  })

  await test.step('open Today and show skip confirmation with keyboard', async () => {
    await page.goto('/')
    const trigger = doseTrigger(page, label)
    await trigger.press('Enter')
    await dialog.getByRole('button', { name: 'I skipped it' }).press('Enter')
    await expect(dialog.getByRole('button', { name: 'Save as skipped' })).toBeVisible()
    await expect(dialog.getByRole('group', { name: `Confirm skipping ${label}` })).toBeVisible()
    await page.keyboard.press('Escape')
    // Base UI returns focus to the opener once the drawer's exit transition finishes.
    await expect(dialog).toHaveCount(0)
    await expect(trigger).toBeFocused()
    await page.keyboard.press('Enter')
    await dialog.getByRole('button', { name: 'I skipped it' }).press('Enter')
    await expect(dialog.getByRole('button', { name: 'Save as skipped' })).toBeVisible()
    await page.keyboard.press('Shift+Tab')
    await expect(dialog.getByRole('button', { name: 'Save as skipped' })).toBeFocused()
    await page.keyboard.press('Enter')
  })

  await test.step('confirm skipped outcome', async () => {
    await expect(outcome('as skipped.')).toContainText(label)
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
    await dialog.getByRole('button', { name: /^Correct outcome/ }).press('Enter')
    await dialog.getByRole('button', { name: 'I took it' }).press('Enter')
    await dialog.getByRole('button', { name: 'Save as taken' }).press('Enter')
    await expect(outcome('as taken.')).toBeVisible()
    await expect(doseStatus(row)).toHaveAccessibleDescription(/Taken/)
    await page.screenshot({ path: testInfo.outputPath('today-corrected.png') })
    await page.reload()
    await expect(doseStatus(row)).toHaveAccessibleDescription(/Taken/)
  })
})
