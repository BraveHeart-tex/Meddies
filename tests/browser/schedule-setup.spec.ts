import { randomUUID } from 'node:crypto'
import { expect, test } from './fixtures'
import { pickTime, timePicker } from './pickers'
import { scrollsHorizontally } from './actions'

const initialScheduleTime = '2035-06-15T09:00:00+03:00'

test.use({ journey: { auth: true, storage: true, initialScheduleTime } })

test('schedule rows: add, remove, duplicates, quantities, failures and known offline', async ({
  page,
  app,
}) => {
  const medicineId = randomUUID()
  const save = page.getByRole('button', { name: 'Save schedule' })
  const add = page.getByRole('button', { name: 'Add another time' })
  const quantity = (row: number) => page.getByLabel(`Quantity for time ${row}`)
  const step = (row: number, direction: 'Fewer' | 'More') =>
    page.getByRole('button', { name: `${direction}: Time ${row} quantity` })

  await test.step('open setup with defaults for a capsule medicine', async () => {
    await app.api('POST', '/api/medicines', {
      id: medicineId,
      label: 'Omega-3',
      strength: '1000 mg',
      unit: 'capsule',
    })
    await page.goto(`/medications?schedule=${medicineId}`)
    await expect(page.getByRole('heading', { name: 'Omega-3' })).toBeVisible()
    await expect(page.getByText('1000 mg · capsule')).toBeVisible()
    await expect(page.getByText(/^Times are Istanbul time\./)).toBeVisible()
    await expect(quantity(1)).toHaveValue('1')
    await expect(page.getByRole('button', { name: /^Remove time/ })).toHaveCount(0)
  })

  await test.step('capsules step by one and stop at one', async () => {
    await expect(step(1, 'Fewer')).toBeDisabled()
    await step(1, 'More').click()
    await expect(quantity(1)).toHaveValue('2')
    await expect(page.getByText('capsules', { exact: true })).toBeVisible()
    await step(1, 'Fewer').click()
    await expect(quantity(1)).toHaveValue('1')
    await expect(step(1, 'Fewer')).toBeDisabled()
  })

  await test.step('add rows and focus the new hour', async () => {
    await pickTime(page, 'Time 1', '08:00')
    await add.click()
    await expect(timePicker(page, 'Time 2').hour).toBeFocused()
    await add.click()
    await expect(timePicker(page, 'Time 3').hour).toBeFocused()
    await expect(page.getByRole('button', { name: 'Remove time 3' })).toBeVisible()
  })

  await test.step('report each row: duplicate time, blank and fractional capsules', async () => {
    await pickTime(page, 'Time 2', '08:00')
    await quantity(2).fill('')
    await pickTime(page, 'Time 3', '20:00')
    await quantity(3).fill('1.5')
    await save.click()
    await expect(page.getByText('08:00 is already in this schedule.')).toBeVisible()
    await expect(page.getByText('Enter a quantity.')).toBeVisible()
    await expect(page.getByText('Use whole capsules.')).toBeVisible()
    await expect(timePicker(page, 'Time 2').hour).toBeFocused()
    await expect(quantity(2)).toHaveValue('')
    await expect(quantity(3)).toHaveAttribute('aria-invalid', 'true')
    expect(await scrollsHorizontally(page)).toBe(false)
  })

  await test.step('errors follow their rows after a removal', async () => {
    await page.getByRole('button', { name: 'Remove time 2' }).click()
    // Focus moves to the row that took its place.
    await expect(timePicker(page, 'Time 2').hour).toBeFocused()
    await expect(page.getByText('08:00 is already in this schedule.')).toHaveCount(0)
    await expect(page.getByText('Enter a quantity.')).toHaveCount(0)
    await expect(page.getByText('Use whole capsules.')).toBeVisible()
    await expect(quantity(2)).toHaveValue('1.5')
    await step(2, 'More').click()
    await expect(quantity(2)).toHaveValue('2')
    await expect(page.getByText('Use whole capsules.')).toHaveCount(0)
    await page.getByRole('button', { name: 'Remove time 2' }).click()
    await expect(add).toBeFocused()
  })

  await test.step('known offline disables saving and keeps values', async () => {
    await page.context().setOffline(true)
    await expect(page.getByRole('button', { name: 'Connect to save' })).toBeDisabled()
    await expect(page.getByText("You're offline.")).toBeVisible()
    await page.context().setOffline(false)
    await expect(save).toBeEnabled()
  })

  await test.step('a rejected save keeps the medicine and the details', async () => {
    let reject = true
    await page.route(
      (url) => url.pathname === '/api/schedules',
      async (route) => {
        if (!reject || route.request().method() !== 'POST') return route.fallback()
        reject = false
        await route.fulfill({ status: 400, json: { error: 'validation' } })
      },
    )
    await save.click()
    await expect(page.getByText("Schedule wasn't saved.")).toBeVisible()
    await expect(
      page.getByText('Omega-3 is saved without a schedule.', { exact: false }),
    ).toBeVisible()
    await expect(save).toBeVisible()
    await expect(timePicker(page, 'Time 1').hour).toHaveText('08')
  })

  await test.step('save, then land on the medicine page', async () => {
    await save.click()
    await expect(page).toHaveURL(new RegExp(`[?&]medicine=${medicineId}`))
    await expect(page.getByText('Schedule saved for Omega-3.')).toBeVisible()
    await expect(page.getByText('Every day at 08:00 (1)')).toBeVisible()
  })

  await test.step('a scheduled medicine shows no form', async () => {
    await page.goto(`/medications?schedule=${medicineId}`)
    await expect(page.getByText('Omega-3 already has a schedule.')).toBeVisible()
    await expect(save).toHaveCount(0)
    await page.getByRole('link', { name: 'View schedule' }).click()
    await expect(page).toHaveURL(new RegExp(`[?&]medicine=${medicineId}`))
  })

  await test.step('an unknown medicine is not in the list', async () => {
    await page.goto(`/medications?schedule=${randomUUID()}`)
    await expect(page.getByText("This medicine isn't in your list.")).toBeVisible()
    await expect(page.getByRole('link', { name: 'Back to Medications' })).toBeVisible()
  })
})

test('tablet quantities step by half and show the unit', async ({ page, app }) => {
  const medicineId = randomUUID()
  await app.api('POST', '/api/medicines', {
    id: medicineId,
    label: 'Iron',
    strength: null,
    unit: 'tablet',
  })
  await page.goto(`/medications?schedule=${medicineId}`)
  const quantity = page.getByLabel('Quantity for time 1')
  const fewer = page.getByRole('button', { name: 'Fewer: Time 1 quantity' })
  await expect(quantity).toHaveValue('1')
  await expect(quantity).toHaveAccessibleDescription(/^tablet Quantity/)
  await fewer.click()
  await expect(quantity).toHaveValue('½')
  await expect(fewer).toBeDisabled()
  await page.getByRole('button', { name: 'More: Time 1 quantity' }).click()
  await page.getByRole('button', { name: 'More: Time 1 quantity' }).click()
  await expect(quantity).toHaveValue('1½')
  await expect(quantity).toHaveAccessibleDescription(/^tablets Quantity/)
  await quantity.fill('0')
  await pickTime(page, 'Time 1', '07:30')
  await page.getByRole('button', { name: 'Save schedule' }).click()
  await expect(page.getByText('Use ½ tablet or more.')).toBeVisible()
  await expect(quantity).toBeFocused()
})
