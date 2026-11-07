import { randomUUID } from 'node:crypto'
import type { Page } from '@playwright/test'
import { expect, test } from './fixtures'
import { focusWindow } from './actions'

test.use({
  journey: {
    auth: true,
    storage: true,
    seed: ({ db, ownerId }) =>
      db
        .prepare('INSERT INTO user_medications(owner_id,id,label,strength,unit) VALUES(?,?,?,?,?)')
        .bind(ownerId, randomUUID(), 'Cached Medicine', '10 mg', 'tablet')
        .run(),
  },
})

const isRead = (method: string, url: URL) => method === 'GET' && url.pathname === '/api/medicines'

/** Holds medicine reads until the returned release runs, so cached content must carry the screen. */
async function holdReads(page: Page) {
  let release = () => {}
  const gate = new Promise<void>((resolve) => (release = resolve))
  await page.route(
    (url) => url.pathname === '/api/medicines',
    async (route) => {
      if (isRead(route.request().method(), new URL(route.request().url()))) await gate
      await route.fallback()
    },
  )
  return async () => {
    release()
    await page.unrouteAll({ behavior: 'wait' })
  }
}

test('the Medications list stays cached across Today and refreshes stale data in place', async ({
  page,
  app,
}) => {
  const nav = page.getByRole('navigation', { name: 'Primary' })
  const count = (n: number) => page.getByText(`${n} ${n === 1 ? 'medication' : 'medications'}`)
  const reads: string[] = []
  page.on('request', (request) => {
    if (isRead(request.method(), new URL(request.url()))) reads.push(request.url())
  })
  const addMedicine = (label: string) =>
    app.api('POST', '/api/medicines', { id: randomUUID(), label, strength: '', unit: 'tablet' })
  const toToday = async () => {
    await nav.getByRole('link', { name: 'Today' }).click()
    await expect(page).toHaveURL(`${app.origin}/`)
  }
  const toMedications = async () => {
    await nav.getByRole('link', { name: 'Medications' }).click()
    await expect(page).toHaveURL(`${app.origin}/medications`)
  }
  // Query's stale time follows the browser clock; session lifetime stays real time.
  await page.clock.install()

  await test.step('the first visit reads the list once', async () => {
    await page.goto('/medications')
    await expect(count(1)).toBeVisible()
    expect(reads).toHaveLength(1)
  })

  await test.step('fresh cached list shows at once on Today → Medications, twice', async () => {
    const release = await holdReads(page)
    for (let round = 0; round < 2; round++) {
      await toToday()
      await toMedications()
      await expect(count(1)).toBeVisible()
    }
    expect(reads).toHaveLength(1)
    await release()
  })

  await test.step('stale list refreshes on screen entry while the cached list stays', async () => {
    await addMedicine('Second Medicine')
    await toToday()
    await page.clock.fastForward('00:31')
    const release = await holdReads(page)
    await toMedications()
    await expect.poll(() => reads.length).toBe(2)
    await expect(count(1)).toBeVisible()
    await release()
    await expect(count(2)).toBeVisible()
  })

  await test.step('stale list refreshes on window focus', async () => {
    await addMedicine('Third Medicine')
    await page.clock.fastForward('00:31')
    await focusWindow(page)
    await expect(count(3)).toBeVisible()
    expect(reads).toHaveLength(3)
  })

  await test.step('no polling while the screen stays open', async () => {
    await page.clock.fastForward('05:00')
    await expect(count(3)).toBeVisible()
    expect(reads).toHaveLength(3)
  })

  await test.step('stale list refreshes on reconnect', async () => {
    await addMedicine('Fourth Medicine')
    await page.context().setOffline(true)
    await page.clock.fastForward('00:31')
    await page.context().setOffline(false)
    await expect(count(4)).toBeVisible()
    expect(reads).toHaveLength(4)
  })

  await test.step('a failed refresh keeps the list and offers a retry', async () => {
    await page.route(
      (url) => url.pathname === '/api/medicines',
      (route) =>
        isRead(route.request().method(), new URL(route.request().url()))
          ? route.fulfill({ status: 503, json: { error: 'unavailable' } })
          : route.fallback(),
      { times: 1 },
    )
    await addMedicine('Fifth Medicine')
    await page.clock.fastForward('00:31')
    await focusWindow(page)
    await expect(page.getByText('Your medicines could not be refreshed.')).toBeVisible()
    await expect(count(4)).toBeVisible()
    await page.getByRole('button', { name: 'Retry loading medicines' }).click()
    await expect(count(5)).toBeVisible()
    await expect(page.getByText('Your medicines could not be refreshed.')).toBeHidden()
  })
})
