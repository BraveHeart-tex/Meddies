import { randomUUID } from 'node:crypto'
import { expect, test } from './fixtures'
import { scrollsHorizontally } from './actions'
import { addDays, istanbulDate } from './seed'

test.use({ journey: { auth: true, storage: true } })

test('a schedule on selected weekdays shows its next Istanbul occurrence', async ({
  page,
  app,
}) => {
  const medicineId = randomUUID()
  const startDate = addDays(istanbulDate(new Date()), 1)
  const monday = new Date(`${startDate}T12:00:00Z`)
  while (monday.getUTCDay() !== 1) monday.setUTCDate(monday.getUTCDate() + 1)
  const nextMonday = monday.toISOString().slice(0, 10)
  const weekdays = page.getByRole('group', { name: 'Repeat on' })
  const save = page.getByRole('button', { name: 'Save schedule' })
  const nav = page.getByRole('navigation', { name: 'Primary' })

  await test.step('open schedule setup for a long-named medicine', async () => {
    await app.api('POST', '/api/medicines', {
      id: medicineId,
      label: `Weekday Browser Medicine ${'M'.repeat(90)}`,
      strength: 'S'.repeat(120),
      unit: 'tablet',
    })
    await page.goto(`/medications?schedule=${medicineId}`)
    await expect(page.getByRole('heading', { name: 'Set dose schedule' })).toBeVisible()
    await expect(page.getByText('Medicine: Weekday Browser Medicine')).toBeVisible()
    await page.getByLabel('Start date in Istanbul').fill(startDate)
    await expect(page.getByLabel('Start date in Istanbul')).toHaveValue(startDate)
    await page.getByLabel('Time 1').fill('23:59')
    await page.getByLabel(/^Quantity/).fill('1')
  })

  await test.step('show accessible feedback for empty weekday selection', async () => {
    for (const day of await weekdays.getByRole('checkbox').all()) await day.uncheck()
    await save.click()
    await expect(weekdays.getByRole('alert')).toHaveText('Choose at least one weekday.')
    await expect(weekdays).toHaveAccessibleDescription('Choose at least one weekday.')
  })

  await test.step('save one weekday', async () => {
    await weekdays.getByRole('checkbox', { name: 'Monday' }).check()
    await save.click()
    await expect(page.getByText('Schedule saved.')).toBeVisible()
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
    await expect(page.getByText('On Monday at 23:59')).toBeVisible()
  })

  await test.step('reload the medicine detail', async () => {
    await page.reload()
    await expect(page.getByText('On Monday at 23:59')).toBeVisible()
    await expect(page.getByText(`Starts ${startDate}`)).toBeVisible()
    expect(
      await scrollsHorizontally(page),
      'long medicine labels must reflow without horizontal scrolling',
    ).toBe(false)
  })
})
