import type { Locator, Page } from '@playwright/test'
import { expect } from './fixtures'
import { drawerHandle } from './locators'

/**
 * Drag the drawer handle down by `distance` CSS px with a mouse pointer. Waits for the drawer
 * to come to rest first: a drag that starts during the snap-back transition may not dismiss.
 */
export async function dragHandle(page: Page, distance: number) {
  const { x, y } = await restingCenter(page, drawerHandle(page))
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x, y + distance, { steps: 12 })
  await page.mouse.up()
}

/**
 * Swipe a finger down by `distance` CSS px from the middle of `start`. Needs `hasTouch`. Base UI
 * ignores mouse drags on the drawer body, so only a touch swipe proves a control's swipe ignore.
 */
export async function touchSwipeFrom(page: Page, start: Locator, distance: number) {
  const { x, y } = await restingCenter(page, start)
  const cdp = await page.context().newCDPSession(page)
  const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', dy: number) =>
    cdp.send('Input.dispatchTouchEvent', {
      type,
      touchPoints: type === 'touchEnd' ? [] : [{ x, y: y + dy }],
    })
  await touch('touchStart', 0)
  for (let step = 1; step <= 12; step++) await touch('touchMove', (distance * step) / 12)
  await touch('touchEnd', distance)
  await cdp.detach()
}

/** The middle of `target` once the drawer has come to rest. */
async function restingCenter(page: Page, target: Locator) {
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
  const box = await target.boundingBox()
  if (!box) throw new Error('drag start is not rendered')
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}

/** Press the backdrop above the content-sized drawer. */
export const pressBackdrop = (page: Page) => page.mouse.click(200, 24)

/** Choose a unit from the Add medication Type menu. */
export async function chooseMedicineType(page: Page, label: 'Tablet' | 'Capsule') {
  await page.getByRole('combobox', { name: 'Type' }).click()
  await page.getByRole('option', { name: label }).click()
}
