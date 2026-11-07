import { randomUUID } from 'node:crypto'
import { expect, test } from './fixtures'
import { datePicker, pickDate, pickTime } from './pickers'
import { scrollsHorizontally } from './actions'
import { addDays } from './seed'

const initialScheduleTime = '2035-06-15T09:00:00+03:00'

test.use({ journey: { auth: true, storage: true, initialScheduleTime } })

test('a schedule on selected weekdays shows its next Istanbul occurrence', async ({
  page,
  app,
}) => {
  const medicineId = randomUUID()
  const startDate = addDays(initialScheduleTime.slice(0, 10), 1)
  const monday = new Date(`${startDate}T12:00:00Z`)
  while (monday.getUTCDay() !== 1) monday.setUTCDate(monday.getUTCDate() + 1)
  const nextMonday = monday.toISOString().slice(0, 10)
  const weekdays = page.getByRole('group', { name: 'Days' })
  const label = `Weekday Browser Medicine ${'M'.repeat(90)}`
  const save = page.getByRole('button', { name: 'Save schedule' })
  const nav = page.getByRole('navigation', { name: 'Primary' })

  await test.step('open schedule setup for a long-named medicine', async () => {
    await app.api('POST', '/api/medicines', {
      id: medicineId,
      label,
      strength: 'S'.repeat(120),
      unit: 'tablet',
    })
    await page.goto(`/medications?schedule=${medicineId}`)
    await expect(page.getByRole('heading', { name: label })).toBeVisible()
    await expect(weekdays).toHaveAccessibleDescription('Every day')
    await pickDate(page, 'Start date', startDate)
    await expect(datePicker(page, 'Start date')).toHaveText('Sat 16 Jun')
    await pickTime(page, 'Time 1', '23:59')
    await expect(page.getByLabel(/^Quantity/)).toHaveValue('1')
  })

  await test.step('show accessible feedback for empty weekday selection', async () => {
    for (const day of await weekdays.getByRole('button').all()) await day.click()
    await expect(weekdays.getByRole('button', { pressed: true })).toHaveCount(0)
    await save.click()
    await expect(page.getByText('Choose at least one day.')).toBeVisible()
    await expect(weekdays).toHaveAccessibleDescription('Choose at least one day. No days chosen')
    await expect(weekdays.getByRole('button', { name: 'Monday' })).toBeFocused()
  })

  await test.step('save one weekday', async () => {
    await weekdays.getByRole('button', { name: 'Monday' }).click()
    await expect(page.getByText('Choose at least one day.')).toHaveCount(0)
    await expect(weekdays).toHaveAccessibleDescription('Mon')
    await save.click()
    await expect(page.getByText(`Schedule saved for ${label}.`)).toBeVisible()
    await expect(page).toHaveURL(new RegExp(`[?&]medicine=${medicineId}`))
  })

  await test.step('check next Istanbul occurrence on Today', async () => {
    await nav.getByRole('link', { name: 'Today' }).click()
    await expect(page.getByText(`on ${nextMonday}`)).toBeVisible()
  })

  await test.step('open medicine detail and verify the saved routine', async () => {
    await nav.getByRole('link', { name: 'Medications' }).click()
    await page
      .getByRole('link', { name: /^View details for Weekday Browser Medicine/ })
      .press('Enter')
    await expect(page.getByRole('heading', { name: 'Saved routine' })).toBeVisible()
    await expect(page).toHaveURL(new RegExp(`[?&]medicine=${medicineId}`))
    await expect(page.getByText('Monday at 23:59')).toBeVisible()
  })

  await test.step('reload the medicine detail', async () => {
    await page.reload()
    await expect(page.getByText('Monday at 23:59')).toBeVisible()
    await expect(page.getByText(`Starts ${startDate}`)).toBeVisible()
    expect(
      await scrollsHorizontally(page),
      'long medicine labels must reflow without horizontal scrolling',
    ).toBe(false)
  })
})
