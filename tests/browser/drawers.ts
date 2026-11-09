import type { Page } from '@playwright/test'
import { expect } from './fixtures'
import { drawerHandle } from './locators'

/**
 * Drag the drawer handle down by `distance` CSS px with a mouse pointer. Waits for the drawer
 * to come to rest first: a drag that starts during the snap-back transition may not dismiss.
 */
export async function dragHandle(page: Page, distance: number) {
  let lastY: number | undefined
  await expect
    .poll(
      async () => {
        const y = (await drawerHandle(page).boundingBox())?.y
        const settled = y !== undefined && y === lastY
        lastY = y
        return settled
      },
      { message: 'drawer must come to rest before a drag', intervals: [100] },
    )
    .toBe(true)
  const box = await drawerHandle(page).boundingBox()
  if (!box) throw new Error('drawer handle is not rendered')
  const x = box.x + box.width / 2
  const y = box.y + box.height / 2
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x, y + distance, { steps: 12 })
  await page.mouse.up()
}

/** Press the backdrop above the content-sized drawer. */
export const pressBackdrop = (page: Page) => page.mouse.click(200, 24)

/** Choose a unit from the Add medication Type menu. */
export async function chooseMedicineType(page: Page, label: 'Tablet' | 'Capsule') {
  await page.getByRole('combobox', { name: 'Type' }).click()
  await page.getByRole('option', { name: label }).click()
}
