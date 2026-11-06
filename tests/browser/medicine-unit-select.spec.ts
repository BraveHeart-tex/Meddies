import { expect, test } from './fixtures'
import { scrollsHorizontally } from './actions'

test.use({ hasTouch: true, journey: { auth: true, storage: true } })

test('choose a medicine unit with keyboard and touch, then save it while locked', async ({
  page,
}) => {
  const label = `Unit Select Medicine ${'L'.repeat(60)}`
  const unit = page.getByRole('combobox', { name: 'Unit' })
  const options = page.getByRole('listbox')

  await test.step('show the default unit with its help text', async () => {
    await page.goto('/medications')
    await expect(unit).toHaveText('Tablet')
    await expect(unit).toHaveAccessibleDescription(/No dose is set here/)
    const box = await unit.boundingBox()
    expect(box?.height).toBeGreaterThanOrEqual(44)
  })

  await test.step('open with the keyboard and close with Escape', async () => {
    await unit.focus()
    await unit.press('Enter')
    await expect(options).toBeVisible()
    await expect(options.getByRole('option', { name: 'Tablet' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    await page.keyboard.press('Escape')
    await expect(options).toBeHidden()
    await expect(unit).toBeFocused()
    await expect(unit).toHaveText('Tablet')
  })

  await test.step('select with typeahead', async () => {
    await unit.press('Enter')
    await expect(options).toBeVisible()
    await page.keyboard.press('c')
    await expect(options.getByRole('option', { name: 'Capsule' })).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(options).toBeHidden()
    await expect(unit).toHaveText('Capsule')
    await expect(unit).toBeFocused()
  })

  await test.step('select by tapping an option', async () => {
    await unit.tap()
    await options.getByRole('option', { name: 'Tablet' }).tap()
    await expect(unit).toHaveText('Tablet')
    await unit.tap()
    await options.getByRole('option', { name: 'Capsule' }).tap()
    await expect(unit).toHaveText('Capsule')
    expect(await scrollsHorizontally(page)).toBe(false)
  })

  await test.step('save the chosen unit', async () => {
    await page.getByLabel('Medicine name').fill(label)
    // Hold the save so the pending state can be observed.
    let release = () => {}
    const held = new Promise<void>((resolve) => (release = resolve))
    await page.route(
      (url) => url.pathname === '/api/medicines',
      async (route) => {
        if (route.request().method() !== 'POST') return route.fallback()
        await held
        await route.fallback()
      },
    )
    await page.getByRole('button', { name: 'Save medicine' }).click()
    await expect(page.getByRole('button', { name: 'Saving medicine...' })).toBeDisabled()
    await expect(unit).toBeDisabled()
    release()
    await expect(page.getByText(`${label} is saved.`)).toBeVisible()
    await page.getByRole('button', { name: 'Done for now' }).click()
    await page.reload()
    await page.getByRole('link', { name: `View details for ${label}` }).click()
    await expect(page.getByText('Unit: capsule')).toBeVisible()
  })
})
