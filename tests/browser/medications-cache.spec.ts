import { randomUUID } from 'node:crypto'
import type { Page } from '@playwright/test'
import { expect, test } from './fixtures'
import { pickDate, pickTime } from './pickers'

test.use({
  journey: {
    auth: true,
    storage: true,
    initialScheduleTime: '2035-06-15T06:00:00.000Z',
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

  await test.step('the first visit reuses the server read', async () => {
    await page.goto('/medications')
    await expect(count(1)).toBeVisible()
    await page.waitForLoadState('load')
    expect(reads).toHaveLength(0)
  })

  await test.step('the cached list shows at once on Today → Medications, twice', async () => {
    const release = await holdReads(page)
    for (let round = 0; round < 2; round++) {
      await toToday()
      await toMedications()
      await expect(count(1)).toBeVisible()
    }
    expect(reads).toHaveLength(0)
    await release()
  })

  await test.step('a changed list arrives from the entry read while the cached list stays', async () => {
    await page.getByRole('link', { name: 'Settings' }).click()
    await expect(page).toHaveURL(`${app.origin}/settings`)
    await addMedicine('Second Medicine')
    await page.clock.fastForward('00:31')
    const medicinesRead = { method: 'POST', path: '/medicines', operation: 'list' }
    app.worker.hold(medicinesRead)
    await toMedications()
    await expect.poll(() => app.worker.held(medicinesRead)).toBeGreaterThan(0)
    await expect(count(1)).toBeVisible()
    app.worker.release(medicinesRead)
    await expect(count(2)).toBeVisible()
    expect(reads).toHaveLength(0)
  })
})

// Allowed reasons: Back/Forward/reload, navigation during a save, consistency across routes.
test('detail correction retains its draft and pending save across navigation, then leaves detail with one Back', async ({
  page,
  app,
}) => {
  await page.goto('/medications')
  await page.getByRole('link', { name: 'View details for Cached Medicine' }).click()
  const detail = page.url()
  await page.getByRole('link', { name: 'Edit details', exact: true }).click()
  const edit = page.url()
  await page.getByRole('textbox', { name: 'Name', exact: true }).fill('Fixed Medicine')
  await page.goBack()
  await expect(page).toHaveURL(detail)
  await page.goForward()
  await expect(page.getByRole('textbox', { name: 'Name', exact: true })).toHaveValue(
    'Fixed Medicine',
  )
  await page.reload()
  await expect(page.getByRole('textbox', { name: 'Name', exact: true })).toHaveValue(
    'Cached Medicine',
  )
  await page.getByRole('textbox', { name: 'Name', exact: true }).fill('Fixed Medicine')
  let release!: () => void
  const held = new Promise<void>((resolve) => {
    release = resolve
  })
  await page.route('**/api/medicines', async (route) => {
    if (route.request().method() !== 'PATCH') return route.fallback()
    await held
    await route.fallback()
  })
  await page.getByRole('button', { name: 'Save details' }).click()
  await expect(page.getByRole('button', { name: 'Saving...' })).toBeDisabled()
  await page.goBack()
  await expect(page).toHaveURL(detail)
  await page.goForward()
  await expect(page).toHaveURL(edit)
  await expect(page.getByRole('button', { name: 'Saving...' })).toBeDisabled()
  release()
  await expect(page).toHaveURL(detail)
  await expect(page.getByRole('heading', { name: 'Fixed Medicine', exact: true })).toBeVisible()
  await expect(page.getByText('Fixed details saved', { exact: true })).toBeVisible()
  await page.goBack()
  await expect(page).toHaveURL(`${app.origin}/medications`)
  await expect(page.getByRole('link', { name: 'View details for Fixed Medicine' })).toBeVisible()

  await page.getByRole('link', { name: 'View details for Fixed Medicine' }).click()
  await expect(page).toHaveURL(detail)
  await expect(page.getByRole('heading', { name: 'Fixed Medicine', exact: true })).toBeVisible()
  await page.getByRole('link', { name: 'Change strength', exact: true }).click()
  await page.getByRole('textbox', { name: 'New strength' }).fill('600 mg')
  await pickDate(page, 'Started on', '2035-06-15')
  await pickTime(page, 'Started at', '08:30')
  await page.getByRole('button', { name: 'Save strength change' }).click()
  await expect(page).toHaveURL(detail)
  await expect(page.getByText('Strength change saved', { exact: true })).toBeVisible()
  await expect(page.getByText('600 mg · tablet', { exact: true })).toBeVisible()
  await page.getByRole('link', { name: 'Strength history', exact: true }).click()
  await expect(page.getByText('Current', { exact: true })).toBeVisible()
  await page.getByRole('link', { name: 'Edit details for this period' }).last().click()
  await expect(page.getByRole('textbox', { name: 'Strength (optional)' })).toHaveValue('10 mg')
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(page).toHaveURL(detail)
  await page.goBack()
  await expect(page).toHaveURL(`${app.origin}/medications`)

  // Allowed reason: navigation during a save.
  await test.step('a delete finishes after navigation without restoring the record', async () => {
    const id = randomUUID()
    const creation = { id, label: 'Vitamin D', strength: '', unit: 'tablet' }
    await app.api('POST', '/api/medicines', creation)
    await page.goto('/medications')
    await page.getByRole('link', { name: 'View details for Vitamin D' }).click()
    const detail = page.url()
    const deletion = { method: 'POST', path: '/medicines', operation: 'delete' }
    app.worker.hold(deletion)
    await page.getByRole('button', { name: 'Delete medication' }).click()
    await page.getByRole('button', { name: 'Delete medication' }).click()
    await expect(page.getByRole('button', { name: 'Deleting...' })).toBeDisabled()
    await expect.poll(() => app.worker.held(deletion)).toBeGreaterThan(0)
    await page.goBack()
    await page
      .getByRole('navigation', { name: 'Primary' })
      .getByRole('link', { name: 'Today' })
      .click()
    await expect(page).toHaveURL(`${app.origin}/`)
    app.worker.release(deletion)
    await expect(page.getByText('Vitamin D deleted', { exact: true })).toBeVisible()
    const replay = await page.request.post('/api/medicines', {
      headers: { origin: app.origin },
      data: creation,
    })
    expect(replay.status()).toBe(409)
    await page
      .getByRole('navigation', { name: 'Primary' })
      .getByRole('link', { name: 'Medications' })
      .click()
    await expect(page.getByRole('link', { name: 'View details for Fixed Medicine' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'View details for Vitamin D' })).toHaveCount(0)
    // Reloading an old detail link must not restore the deleted Medicine.
    await page.goto(detail)
    await expect(
      page.getByRole('heading', { name: "This medication isn't in your list" }),
    ).toBeVisible()
    await expect(page.getByRole('button', { name: 'Delete medication' })).toHaveCount(0)
  })

  // Allowed reason: navigation during a save.
  await test.step('an archive finishes after navigation and shows in Archived medications', async () => {
    const id = randomUUID()
    await app.api('POST', '/api/medicines', {
      id,
      label: 'Magnesium',
      strength: '',
      unit: 'tablet',
    })
    await app.api('POST', '/api/schedules', {
      id: randomUUID(),
      medicineId: id,
      startDate: '2035-06-15',
      times: [{ time: '20:00', quantity: 1 }],
    })
    const nav = page.getByRole('navigation', { name: 'Primary' })
    await page.goto('/')
    await expect(page.getByRole('main').getByText('Magnesium').first()).toBeVisible()
    await page.goto('/medications')
    await page.getByRole('link', { name: 'View details for Magnesium' }).click()
    const archive = { method: 'POST', path: '/medicines', operation: 'archive' }
    app.worker.hold(archive)
    await page.getByRole('button', { name: 'Archive medication' }).click()
    await page
      .getByRole('dialog', { name: 'Archive Magnesium?' })
      .getByRole('button', { name: 'Archive medication' })
      .click()
    await expect(page.getByRole('button', { name: 'Archiving...' })).toBeDisabled()
    await expect.poll(() => app.worker.held(archive)).toBeGreaterThan(0)
    await page.goBack()
    await nav.getByRole('link', { name: 'Today' }).click()
    await expect(page).toHaveURL(`${app.origin}/`)
    app.worker.release(archive)
    await expect(page.getByText('Magnesium archived', { exact: true })).toBeVisible()
    // Today drops its future doses once the archive confirms.
    await expect(page.getByRole('main').getByText('Magnesium')).toHaveCount(0)
    await nav.getByRole('link', { name: 'Medications' }).click()
    await expect(page.getByRole('link', { name: 'View details for Fixed Medicine' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'View details for Magnesium' })).toHaveCount(0)
    await page.getByRole('link', { name: 'Archived medications' }).click()
    await page.getByRole('link', { name: /^Magnesium/ }).click()
    await expect(page.getByText('Kept in History')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Archive medication' })).toHaveCount(0)
  })

  // Allowed reason: data consistency across routes.
  await test.step('a restore returns the archived medication to Medications with No schedule', async () => {
    const nav = page.getByRole('navigation', { name: 'Primary' })
    await page.getByRole('button', { name: 'Restore medication' }).click()
    await page
      .getByRole('dialog', { name: 'Restore Magnesium?' })
      .getByRole('button', { name: 'Restore medication' })
      .click()
    await expect(page.getByText('Magnesium restored', { exact: true })).toBeVisible()
    await expect(page.getByText('No schedule', { exact: true })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Set schedule' })).toBeVisible()
    await nav.getByRole('link', { name: 'Medications' }).click()
    await expect(page.getByRole('link', { name: 'View details for Magnesium' })).toBeVisible()
    await page.getByRole('link', { name: 'Archived medications' }).click()
    await expect(page.getByText('No archived medications', { exact: true })).toBeVisible()
    await expect(page.getByRole('link', { name: /^Magnesium/ })).toHaveCount(0)
    // A fresh load reads the same from the server.
    await page.reload()
    await expect(page.getByRole('link', { name: /^Magnesium/ })).toHaveCount(0)
    await page.goto('/medications')
    await page.getByRole('link', { name: 'View details for Magnesium' }).click()
    await expect(page.getByText('No schedule', { exact: true })).toBeVisible()
  })
})
