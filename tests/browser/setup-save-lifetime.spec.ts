import { randomUUID } from 'node:crypto'
import { expect, test } from './fixtures'
import { scrollsHorizontally } from './actions'
import { pickTime } from './pickers'
import { chooseMedicineType } from './drawers'

test.use({
  journey: { auth: true, storage: true, initialScheduleTime: '2035-06-15T09:00:00+03:00' },
})

for (const viewport of [
  { name: 'phone', width: 402, height: 874, reducedMotion: 'no-preference' as const },
  // Retained after #121 found a zero-width Toast message beside its recovery action.
  // This is a narrow viewport regression, not text enlargement or zoom evidence.
  {
    name: '201px toast wrapping regression',
    width: 201,
    height: 437,
    reducedMotion: 'reduce' as const,
  },
]) {
  // eslint-disable-next-line meddies/no-width-loop-tests -- only 201px squeezed the Toast message to zero width (#121)
  test.describe(viewport.name, () => {
    test.use({
      viewport: { width: viewport.width, height: viewport.height },
      reducedMotion: viewport.reducedMotion,
    })
    const outcomes =
      viewport.width === 402 ? (['confirmed', 'unconfirmed'] as const) : (['unconfirmed'] as const)
    // Allowed reason: navigation during a save.
    for (const outcome of outcomes) {
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
        await page.goto('/medications')
        await page.getByRole('link', { name: 'Add a medication' }).click()
        await page.getByLabel('Name', { exact: true }).fill('Magnesium')
        await page.getByLabel(/^Strength/).fill(' 200 mg ')
        await chooseMedicineType(page, 'Tablet')
        await page.getByRole('button', { name: 'Save medication', exact: true }).click()
        await expect(page.getByRole('button', { name: 'Saving medication...' })).toBeDisabled()
        // The modal Drawer covers the nav, so Back is how she leaves during the save.
        await page.goBack()
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
            await page
              .getByRole('main')
              .getByRole('link', { name: 'Medications', exact: true })
              .click()
            await page.getByRole('link', { name: 'Add a medication' }).click()
            await expect(page.getByLabel('Name', { exact: true })).toHaveValue('')
            await expect(
              page.getByRole('button', { name: 'Save medication', exact: true }),
            ).toBeEnabled()
          },
          unconfirmed: async () => {
            await expect(
              page.getByText('Magnesium might not have saved', { exact: true }),
            ).toBeVisible()
            expect(
              await scrollsHorizontally(page),
              'the unconfirmed save toast fits the viewport',
            ).toBe(false)
            await page.getByRole('button', { name: 'Return to form', exact: true }).click()
            await expect(page.getByLabel('Name', { exact: true })).toHaveValue('Magnesium')
            await expect(page.getByLabel(/^Strength/)).toHaveValue(' 200 mg ')
            await page.getByRole('button', { name: 'Try saving medication again' }).click()
            await expect(page.getByRole('status', { name: 'Saved medication' })).toBeVisible()
            expect(posts).toHaveLength(2)
            expect(posts[1]).toBe(posts[0])
          },
        }
        await checkOutcome[outcome]()
      })
    }

    if (viewport.width !== 402) return

    // Allowed reason: navigation during a save.
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
      // Setup covers the tab bar (212·C0); Cancel leaves without asking while a save is pending.
      await page.getByRole('button', { name: 'Cancel', exact: true }).click()
      await page.getByRole('link', { name: 'Today', exact: true }).click()
      await expect(page).toHaveURL(app.origin + '/')
      await expect(page.getByText('Saving schedule for Magnesium…', { exact: true })).toBeVisible()
      release()
      await expect(page.getByText('Schedule saved for Magnesium', { exact: true })).toBeVisible()
      await page.getByRole('button', { name: 'Open', exact: true }).click()
      await expect(page.getByRole('heading', { name: 'Magnesium', exact: true })).toBeVisible()
      await expect(
        page
          .getByRole('region', { name: 'Schedule', exact: true })
          .getByText('12:00', { exact: true }),
      ).toBeVisible()
    })
  })
}
