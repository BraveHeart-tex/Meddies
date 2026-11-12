import { resolve } from 'node:path'
import { captureCases, captureRendered } from './capture'
import { expect, test } from './fixtures'
import { boxes, shellElements } from './layout'
import { rootFallback } from './locators'
import { enlargeText, scrollsHorizontally, stylesheetsLoaded } from './actions'

// Opt-in design evidence, outside CI. Persistent frames need no storage or artificial reads.
test.use({ journey: { auth: false, storage: false } })

test('capture 109·L1 for design review', { tag: '@visual' }, async ({ page }) => {
  const out = process.env.MEDDIES_VISUAL_OUT
  // eslint-disable-next-line playwright/no-skipped-test -- local dev-only design review opt-in
  test.skip(!out || process.env.MEDDIES_BROWSER_DEV !== '1', 'Set dev mode and visual output')
  const entry = await captureRendered(
    page,
    {
      name: '109-l1',
      path: '/lab/109-l1',
      ready: (page) => page.getByRole('navigation', { name: 'Primary' }),
    },
    resolve(out!),
  )
  expect(entry.statusLabels).toEqual(['Opening Meddies'])
  expect(entry.horizontalOverflow).toBe(false)
  expect(entry.viewport).toBe('402x874')
  expect(entry.reducedMotion).toBe('no-preference')
  // Current production composition geometry at 402px, from AppShell and AppHeaderSkeleton.
  expect(entry.boxes).toEqual({
    header: { x: 20, y: 14, width: 362, height: 56.8 },
    settings: { x: 338, y: 14, width: 44, height: 44 },
    primaryNav: { x: 16, y: 788, width: 370, height: 70 },
  })
  await expect(page.getByRole('link', { name: 'Settings' })).toHaveAttribute('href', '/settings')
  // Keyboard access stays usable in the rendered composition.
  await page.keyboard.press('Tab')
  await expect(page.getByRole('link', { name: 'Settings' })).toBeFocused()

  // A narrow viewport exercises the unchanged production composition, without another preset.
  await page.setViewportSize({ width: 320, height: 740 })
  await expect.poll(() => stylesheetsLoaded(page)).toBe(true)
  const narrow = await boxes(shellElements(page))
  expect(narrow.settings).not.toBeNull()
  expect(await scrollsHorizontally(page)).toBe(false)
  await expect(page.getByRole('navigation', { name: 'Primary' })).toBeVisible()
})

test('review the lab index and narrow frame links', { tag: '@visual' }, async ({ page }) => {
  const out = process.env.MEDDIES_VISUAL_OUT
  // eslint-disable-next-line playwright/no-skipped-test -- local dev-only design review opt-in
  test.skip(!out || process.env.MEDDIES_BROWSER_DEV !== '1', 'Set dev mode and visual output')
  const entry = await captureRendered(
    page,
    {
      name: 'index',
      path: '/lab',
      ready: (page) => page.getByRole('navigation', { name: 'Primary' }),
    },
    resolve(out!, 'index'),
  )
  expect(entry.horizontalOverflow).toBe(false)
  const link = page.getByRole('link', { name: '109·L1 · Cold launch' })
  await expect(link).toHaveAttribute('href', '/lab/109-l1')
  const narrow = await captureRendered(
    page,
    {
      name: 'index',
      path: '/lab',
      ready: (page) => page.getByRole('navigation', { name: 'Primary' }),
    },
    resolve(out!, 'index-narrow'),
    captureCases.narrow,
  )
  expect(narrow.horizontalOverflow).toBe(false)
  // Synthetic 200% root font-size probe at the primary width, not browser or device zoom.
  await page.setViewportSize({ width: 402, height: 874 })
  await enlargeText(page)
  expect(await scrollsHorizontally(page)).toBe(false)
  await expect(link).toBeVisible()
  await page.screenshot({ path: resolve(out!, 'index-enlarged-text.png') })
  await link.focus()
  await page.keyboard.press('Enter')
  await expect(rootFallback(page)).toBeVisible()
})
