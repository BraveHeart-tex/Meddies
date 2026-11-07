import { randomUUID } from 'node:crypto'
import type { Page } from '@playwright/test'
import { expect, test } from './fixtures'

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
    // Today's server read refreshes the shared list, so add the medicine after it.
    await toToday()
    await addMedicine('Second Medicine')
    await page.clock.fastForward('00:31')
    const release = await holdReads(page)
    await toMedications()
    await expect.poll(() => reads.length).toBe(2)
    await expect(count(1)).toBeVisible()
    await release()
    await expect(count(2)).toBeVisible()
  })
})
