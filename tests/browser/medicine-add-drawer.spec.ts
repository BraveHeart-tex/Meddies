import { expect, test } from './fixtures'
import { chooseMedicineType, dragHandle, pressBackdrop } from './drawers'
import { drawer } from './locators'

test.use({ journey: { auth: true, storage: true } })

const name = (page: Parameters<typeof drawer>[0]) => page.getByLabel('Name', { exact: true })
const addLink = (page: Parameters<typeof drawer>[0]) =>
  page.getByRole('link', { name: 'Add a medication' })

// Allowed reason: Back, Forward or reload behavior.
test('reload at Add opens the Drawer and Back closes it', async ({ page, app }) => {
  await page.goto('/medications')
  await expect(page.getByRole('heading', { name: 'No medications here yet.' })).toBeVisible()
  await addLink(page).click()
  await expect(page).toHaveURL(`${app.origin}/medications?add`)
  await expect(drawer(page).getByRole('heading', { name: 'Add medication' })).toBeVisible()

  await page.reload()
  await expect(drawer(page).getByRole('heading', { name: 'Add medication' })).toBeVisible()
  await expect(name(page)).toBeVisible()

  await page.goBack()
  await expect(page).toHaveURL(`${app.origin}/medications`)
  await expect(drawer(page)).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'No medications here yet.' })).toBeVisible()
})

// Allowed reason: real pointer gestures.
test('a swipe discards the draft and is refused while saving', async ({ page, app }) => {
  await page.goto('/medications')
  await expect(page.getByRole('heading', { name: 'No medications here yet.' })).toBeVisible()
  await addLink(page).click()

  await test.step('a short swipe snaps back and keeps the draft', async () => {
    await name(page).fill('Magnesium')
    await dragHandle(page, 24)
    await expect(drawer(page)).toBeVisible()
    await expect(name(page)).toHaveValue('Magnesium')
  })

  await test.step('a full swipe dismisses and discards', async () => {
    await dragHandle(page, 500)
    await expect(drawer(page)).toHaveCount(0)
    await expect(page).toHaveURL(`${app.origin}/medications`)
    await addLink(page).click()
    await expect(name(page)).toHaveValue('')
    await expect(page.getByText('Pick up where you left off', { exact: false })).toHaveCount(0)
  })

  await test.step('no dismissal path closes the Drawer while saving', async () => {
    let release!: () => void
    const held = new Promise<void>((resolve) => (release = resolve))
    await page.route('**/api/medicines', async (route) => {
      if (route.request().method() !== 'POST') return route.fallback()
      await held
      await route.fallback()
    })
    await name(page).fill('Magnesium')
    await chooseMedicineType(page, 'Tablet')
    await page.getByRole('button', { name: 'Save medication', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Saving medication...' })).toBeDisabled()

    await dragHandle(page, 500)
    await pressBackdrop(page)
    await page.keyboard.press('Escape')
    await expect(page).toHaveURL(`${app.origin}/medications?add`)
    await expect(drawer(page)).not.toHaveAttribute('data-ending-style')
    await expect(name(page)).toHaveValue('Magnesium')

    release()
    await expect(page.getByRole('heading', { name: 'Magnesium', exact: true })).toBeFocused()
    await expect(page).toHaveURL(/\/medications\?medicine=/)
  })
})
