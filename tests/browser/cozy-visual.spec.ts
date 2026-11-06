import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { expect, test } from './fixtures'
import { doseTrigger, drawer } from './locators'
import { datePicker, timePicker } from './pickers'

// Captures Today, Medications and the Record dose drawer with the Cozy Care UI kit sample
// data (Thursday 14:38) for visual comparison with the design export. Screenshots are review
// artifacts, not baselines. Run with --project=narrow for the 320px stress check.
const initialScheduleTime = '2035-11-08T08:00:00+03:00'
const day = initialScheduleTime.slice(0, 10)
const at = (time: string) => new Date(`${day}T${time}:00+03:00`).toISOString()
// The last UUID character selects the identity tint: 2 butter, 3 blush, 4 peach, 0 plum, 1 mist.
const medicine = (id: string, label: string, strength: string, unit = 'tablet') => ({
  id: `00000000-0000-4000-8000-0000000000${id}`,
  label,
  strength,
  unit,
})
const medicines = [
  medicine('d2', 'Vitamin D3', '1000 IU'),
  medicine('a3', 'Magnesium', '200 mg'),
  medicine('b4', 'Omega-3', '1000 mg', 'capsule'),
  medicine('c0', 'Iron bisglycinate', '14 mg'),
  medicine('e1', 'Cetirizine', '10 mg'),
]
const schedule = (id: string, medicineIndex: number, time: string, weekdays?: number[]) => ({
  id: `10000000-0000-4000-8000-0000000000${id}`,
  medicineId: medicines[medicineIndex].id,
  times: [{ time, quantity: 1 }],
  ...(weekdays && { weekdays }),
})
const schedules = [
  schedule('01', 0, '09:00'),
  schedule('02', 1, '14:00'),
  schedule('03', 2, '20:00'),
  schedule('04', 3, '08:00', [1, 3, 5]),
]

test.use({ journey: { auth: true, storage: true, initialScheduleTime } })

test('capture Cozy Care screens for visual review', async ({ page, app }, testInfo) => {
  const out = resolve(process.env.MEDDIES_VISUAL_OUT || testInfo.outputDir)
  await mkdir(out, { recursive: true })
  const { width, height } = page.viewportSize()!
  const size = `${width}x${height}`
  const shot = (name: string, fullPage = false) =>
    page.screenshot({
      path: resolve(out, `${name}-${size}${fullPage ? '-full' : ''}.png`),
      fullPage,
      animations: 'disabled',
    })
  const dialog = drawer(page)

  await test.step('seed the UI kit sample routine', async () => {
    for (const item of medicines) await app.api('POST', '/api/medicines', item)
    for (const item of schedules)
      await app.api('POST', '/api/schedules', { ...item, startDate: day })
    await app.setScheduleTime(`${day}T09:12:00+03:00`)
    await app.api('PUT', '/api/schedules', {
      outcome: 'Taken',
      scheduleId: schedules[0].id,
      dueAt: at('09:00'),
      takenAt: at('09:12'),
      quantity: 1,
    })
    await app.setScheduleTime(`${day}T14:38:00+03:00`)
  })

  await test.step('capture Today', async () => {
    await page.goto('/')
    await expect(
      page.getByRole('list', { name: "Today's doses" }).getByRole('listitem').first(),
    ).toBeVisible()
    await shot('prod-today')
    await shot('prod-today', true)
  })

  await test.step('capture the Record dose drawer', async () => {
    await doseTrigger(page, 'Magnesium').press('Enter')
    await expect(dialog).toBeVisible()
    await shot('prod-drawer')
    await dialog.getByRole('button', { name: 'I took it' }).click()
    await expect(dialog.getByRole('button', { name: 'Save as taken' })).toBeVisible()
    await shot('prod-drawer-taken')
    await dialog.getByRole('button', { name: 'Other', exact: true }).click()
    await shot('prod-drawer-other')
    await datePicker(dialog, 'Taken date in Istanbul').click()
    await expect(page.getByRole('dialog', { name: 'Taken date in Istanbul' })).toBeVisible()
    await shot('prod-drawer-calendar')
    await page.keyboard.press('Escape')
    await expect(datePicker(dialog, 'Taken date in Istanbul')).toBeFocused()
    await timePicker(dialog, 'Taken time in Istanbul').minute.click()
    await expect(page.getByRole('listbox')).toBeVisible()
    await shot('prod-drawer-time-select')
    await page.keyboard.press('Escape')
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
  })

  await test.step('capture Medications', async () => {
    await page.goto('/medications')
    await expect(page.getByRole('heading', { name: 'Cetirizine' })).toBeVisible()
    await shot('prod-medications')
    await shot('prod-medications', true)
  })

  await test.step('capture the open Unit select', async () => {
    const unit = page.getByRole('combobox', { name: 'Unit' })
    await unit.scrollIntoViewIfNeeded()
    await unit.press('Enter')
    await expect(page.getByRole('listbox')).toBeVisible()
    await shot('prod-unit-select')
    await page.keyboard.press('Escape')
    await expect(unit).toBeFocused()
    await shot('prod-unit-select-focus')
  })
})
