import type { Page } from '@playwright/test'
import { expect, test } from './fixtures'
import { doseRow, doseStatus, doseTrigger, drawer, drawerHandle } from './locators'
import { insertScheduledMedicine } from './seed'

const initialScheduleTime = '2035-06-15T09:00:00+03:00'
const today = initialScheduleTime.slice(0, 10)
const dueAt = new Date(`${today}T08:30:00+03:00`).toISOString()

test.use({
  journey: {
    auth: true,
    storage: true,
    initialScheduleTime,
    seed: ({ db, ownerId }) =>
      insertScheduledMedicine(db, ownerId, {
        label: 'Swipe Medicine',
        startDate: today,
        times: [{ time: '08:30', quantity: 1 }],
      }),
  },
})

/** Drag the drawer handle down by `distance` CSS px with a mouse pointer. */
async function dragHandle(page: Page, distance: number) {
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
const pressBackdrop = (page: Page) => page.mouse.click(200, 24)

test('swipe, backdrop and Escape discard drafts, and never dismiss while saving', async ({
  page,
}) => {
  const row = doseRow(page, dueAt)
  const trigger = doseTrigger(row, 'Swipe Medicine')
  const status = doseStatus(row)
  const dialog = drawer(page)
  const amount = dialog.getByLabel(/^Amount/)
  const save = dialog.getByRole('button', { name: 'Save as taken' })
  const close = dialog.getByRole('button', { name: 'Close dose details' })

  const startTakenDraft = async () => {
    await trigger.click()
    await dialog.getByRole('button', { name: 'I took it' }).click()
    await amount.fill('2')
  }

  await test.step('a short swipe snaps back and keeps the draft', async () => {
    await page.goto('/')
    await expect(status).toHaveAccessibleDescription(/Not logged/)
    await startTakenDraft()
    await dragHandle(page, 24)
    await expect(dialog).toBeVisible()
    await expect(amount).toHaveValue('2')
  })

  await test.step('a full swipe dismisses without saving and restores focus', async () => {
    await dragHandle(page, 400)
    await expect(dialog).toHaveCount(0)
    await expect(trigger).toBeFocused()
    await expect(status).toHaveAccessibleDescription(/Not logged/)
  })

  await test.step('reopening starts from a fresh choice', async () => {
    await trigger.click()
    await expect(dialog.getByText('What happened?')).toBeVisible()
    await expect(save).toHaveCount(0)
  })

  await test.step('a backdrop press dismisses without saving', async () => {
    await dialog.getByRole('button', { name: 'I took it' }).click()
    await amount.fill('2')
    await pressBackdrop(page)
    await expect(dialog).toHaveCount(0)
    await expect(status).toHaveAccessibleDescription(/Not logged/)
  })

  await test.step('no dismissal path closes the drawer while a save is pending', async () => {
    let release!: () => void
    const held = new Promise<void>((resolve) => (release = resolve))
    await page.route(
      (url) => url.pathname === '/api/schedules',
      async (route) => {
        if (route.request().method() !== 'PUT') return route.fallback()
        await held
        await route.fallback()
      },
    )
    await startTakenDraft()
    await save.click()
    await expect(dialog.getByRole('button', { name: 'Saving intake...' })).toBeDisabled()
    await expect(close).toBeDisabled()

    // Each attempt must leave the drawer open, not merely still mid-exit-transition.
    const expectStillOpen = async () => {
      await expect(status).toHaveAttribute('aria-expanded', 'true')
      await expect(dialog).not.toHaveAttribute('data-ending-style')
      await expect(amount).toHaveValue('2')
    }
    await page.keyboard.press('Escape')
    await page.keyboard.press('Escape')
    await expectStillOpen()
    await pressBackdrop(page)
    await expectStillOpen()
    await dragHandle(page, 400)
    await expectStillOpen()

    release()
    await expect(dialog).toHaveCount(0)
    await expect(status).toHaveAccessibleDescription(/Taken/)
    await expect(row).toContainText('took 2 tablets')
  })

  await test.step('Escape dismisses again once the save has finished', async () => {
    await trigger.click()
    await expect(dialog).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    await expect(trigger).toBeFocused()
  })
})
