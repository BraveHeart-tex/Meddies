import type { Locator, Page } from '@playwright/test'
import { expect } from './fixtures'
import { drawer, drawerHandle } from './locators'

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
  await drawerAtRest(page)
  const box = await target.boundingBox()
  if (!box) throw new Error('drag start is not rendered')
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}

/**
 * Wait until the open drawer holds still: no opening, closing or swipe state, and the same box
 * on two polls 100ms apart.
 */
export async function drawerAtRest(page: Page) {
  const popup = drawer(page)
  let last: string | undefined
  await expect
    .poll(
      async () => {
        const states = await Promise.all(
          ['data-starting-style', 'data-ending-style', 'data-swiping'].map((name) =>
            popup.getAttribute(name),
          ),
        )
        const moving = states.some((state) => state !== null)
        const box = await popup.boundingBox()
        const current = moving || !box ? undefined : JSON.stringify(box)
        const settled = current !== undefined && current === last
        last = current
        return settled
      },
      { message: 'drawer must come to rest', intervals: [100] },
    )
    .toBe(true)
}

/** The open drawer's bottom edge in CSS px, rounded, or null while it is not rendered. */
export async function drawerBottom(page: Page) {
  const box = await drawer(page).boundingBox()
  return box && Math.round(box.y + box.height)
}

/** Press the backdrop above the content-sized drawer. */
export const pressBackdrop = (page: Page) => page.mouse.click(200, 24)

/** Choose a unit from the Add medication Type menu. */
export async function chooseMedicineType(page: Page, label: 'Tablet' | 'Capsule') {
  await page.getByRole('combobox', { name: 'Type' }).click()
  await page.getByRole('option', { name: label }).click()
}
