import { randomUUID } from 'node:crypto'
import { expect, test } from './fixtures'
import { pickTime } from './pickers'

test.use({
  journey: { auth: true, storage: true, initialScheduleTime: '2035-06-15T09:00:00+03:00' },
})

for (const viewport of [
  { name: 'phone', width: 402, height: 874, reducedMotion: 'no-preference' as const },
  { name: 'narrow', width: 320, height: 740, reducedMotion: 'reduce' as const },
  // Retained after FE-668 found a zero-width Toast message beside its recovery action.
  // This is a narrow viewport regression, not text enlargement or zoom evidence.
  {
    name: '201px toast wrapping regression',
    width: 201,
    height: 437,
    reducedMotion: 'reduce' as const,
  },
]) {
  test.describe(viewport.name, () => {
    test.use({
      viewport: { width: viewport.width, height: viewport.height },
      reducedMotion: viewport.reducedMotion,
    })
    for (const outcome of ['confirmed', 'unconfirmed'] as const) {
      test(`medicine save ${outcome} after leaving Add`, async ({ page, app }) => {
        let release!: () => void
        const held = new Promise<void>((resolve) => (release = resolve))
        const posts: string[] = []
        await page.route('**/api/medicines', async (route) => {
          if (route.request().method() !== 'POST') return route.fallback()
          posts.push(route.request().postData()!)
          if (posts.length === 1) {
            await held
            if (outcome === 'unconfirmed') return route.abort('connectionfailed')
          }
          await route.fallback()
        })
        await page.goto('/medications?add')
        await page.getByLabel('Medicine name').fill('Magnesium')
        await page.getByLabel(/^Product strength/).fill(' 200 mg ')
        await page.getByRole('button', { name: 'Tablet', exact: true }).click()
        await page.getByRole('button', { name: 'Save medicine', exact: true }).click()
        await expect(page.getByRole('button', { name: 'Saving medicine...' })).toBeDisabled()
        await page.getByRole('link', { name: 'Today', exact: true }).click()
        await expect(page).toHaveURL(app.origin + '/')
        await expect(page.getByText('Saving Magnesium…', { exact: true })).toBeVisible()
        release()
        const checkOutcome = {
          confirmed: async () => {
            await expect(page.getByText('Magnesium saved', { exact: true })).toBeVisible()
            await page.getByRole('button', { name: 'Open', exact: true }).click()
            await expect(
              page.getByRole('heading', { name: 'Magnesium', exact: true }),
            ).toBeVisible()
            await page.getByRole('link', { name: 'Medications', exact: true }).click()
            await page.getByRole('link', { name: 'Add a medicine' }).click()
            await expect(page.getByLabel('Medicine name')).toHaveValue('')
            await expect(
              page.getByRole('button', { name: 'Save medicine', exact: true }),
            ).toBeEnabled()
          },
          unconfirmed: async () => {
            await expect(
              page.getByText('Magnesium was not confirmed', { exact: true }),
            ).toBeVisible()
            await page.getByRole('button', { name: 'Return to form', exact: true }).click()
            await expect(page.getByLabel('Medicine name')).toHaveValue('Magnesium')
            await expect(page.getByLabel(/^Product strength/)).toHaveValue(' 200 mg ')
            await page.getByRole('button', { name: 'Retry saving medicine' }).click()
            await expect(page.getByRole('region', { name: 'Saved medicine' })).toBeVisible()
            expect(posts).toHaveLength(2)
            expect(posts[1]).toBe(posts[0])
          },
        }
        await checkOutcome[outcome]()
      })
    }

    test('schedule confirmation follows navigation to Today', async ({ page, app }) => {
      const id = randomUUID()
      await app.api('POST', '/api/medicines', {
        id,
        label: 'Magnesium',
        strength: '200 mg',
        unit: 'tablet',
      })
      let release!: () => void
      const held = new Promise<void>((resolve) => (release = resolve))
      await page.route('**/api/schedules', async (route) => {
        if (route.request().method() !== 'POST') return route.fallback()
        await held
        await route.fallback()
      })
      await page.goto(`/medications?schedule=${id}`)
      await pickTime(page, 'Time 1', '12:00')
      await page.getByRole('button', { name: 'Save schedule', exact: true }).click()
      await expect(page.getByRole('button', { name: 'Saving schedule...' })).toBeDisabled()
      await page.getByRole('link', { name: 'Today', exact: true }).click()
      await expect(page).toHaveURL(app.origin + '/')
      await expect(page.getByText('Saving schedule for Magnesium…', { exact: true })).toBeVisible()
      release()
      await expect(page.getByText('Schedule saved for Magnesium', { exact: true })).toBeVisible()
      await page.getByRole('button', { name: 'Open', exact: true }).click()
      await expect(page.getByRole('heading', { name: 'Magnesium', exact: true })).toBeVisible()
      await expect(page.getByText('Every day at 12:00 (1)', { exact: true })).toBeVisible()
    })
  })
}
