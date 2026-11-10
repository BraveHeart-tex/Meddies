import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { hydrated, scrollsHorizontally, stylesheetsLoaded } from './actions'
import { captureCases } from './capture'
import { expect, test } from './fixtures'

// Design-review captures for `pnpm lab:capture <slug-prefix>`, outside CI. Lab frames are
// persistent synthetic screens, so they need no storage, auth or held reads.
test.use({ journey: { auth: false, storage: false } })

// The dev overlay and indicator live in this element. Hidden from screenshots only: errors it
// would show are collected from the console and page errors instead.
const hideDevOverlay = 'nextjs-portal { display: none !important; }'

test('capture lab frames by slug prefix', { tag: '@visual' }, async ({ page }) => {
  const out = process.env.MEDDIES_VISUAL_OUT
  const prefix = process.env.MEDDIES_LAB_PREFIX
  // eslint-disable-next-line playwright/no-skipped-test -- local dev-only design review opt-in
  test.skip(
    !out || !prefix || process.env.MEDDIES_BROWSER_DEV !== '1',
    'Run pnpm lab:capture <slug-prefix>',
  )
  // Each frame compiles on first request under next dev.
  test.setTimeout(15 * 60_000)
  await mkdir(out!, { recursive: true })

  // The index links every registered frame (design-lab-http.test.ts asserts it).
  await page.goto('/lab')
  const hrefs = await Promise.all(
    (await page.getByRole('link').all()).map((link) => link.getAttribute('href')),
  )
  const slugs = hrefs
    .filter((href) => href?.startsWith(`/lab/${prefix}`))
    .map((href) => href!.slice('/lab/'.length))
  expect(slugs, `No lab frame slug starts with "${prefix}"`).not.toHaveLength(0)

  let errors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  page.on('pageerror', (error) => errors.push(error.message))

  const summaries = []
  for (const slug of slugs) {
    const captures = []
    for (const { viewport, reducedMotion } of [captureCases.phone, captureCases.narrow]) {
      const size = `${viewport.width}x${viewport.height}`
      errors = []
      await page.setViewportSize(viewport)
      await page.emulateMedia({ reducedMotion })
      await page.goto(`/lab/${slug}`)
      await page.addStyleTag({ content: hideDevOverlay })
      await expect
        .poll(() => stylesheetsLoaded(page), { message: 'stylesheets should load' })
        .toBe(true)
      // Hydration errors arrive once the client chunks have loaded and run.
      await expect.poll(() => hydrated(page), { message: 'the frame should hydrate' }).toBe(true)
      const screenshot = `${slug}-${size}.png`
      // Screen-size, not full-page: what the phone shows without scrolling.
      await page.screenshot({ path: resolve(out!, screenshot), animations: 'disabled' })
      captures.push({
        viewport: size,
        screenshot,
        horizontalOverflow: await scrollsHorizontally(page),
        consoleErrors: [...errors],
      })
    }
    const summary = { slug, path: `/lab/${slug}`, captures }
    summaries.push(summary)
    await writeFile(resolve(out!, `${slug}.json`), `${JSON.stringify(summary, null, 2)}\n`)
  }
  const problems = summaries.flatMap(({ slug, captures }) =>
    captures.flatMap(({ viewport, horizontalOverflow, consoleErrors }) => [
      ...(horizontalOverflow ? [`${slug} at ${viewport}: horizontal overflow`] : []),
      ...consoleErrors.map((error) => `${slug} at ${viewport}: ${error}`),
    ]),
  )
  expect(problems, `Frames captured to ${out}`).toEqual([])
})
