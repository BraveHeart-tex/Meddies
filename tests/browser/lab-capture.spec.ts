import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { hydrated, scrollsHorizontally, stylesheetsLoaded } from './actions'
import type { Page } from '@playwright/test'
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
    const { viewport, reducedMotion } = captureCases.phone
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

// The Scanner from Add medicine at the default viewport: the Scan row, framing, a stalled read,
// camera unavailable, No match and Barcode read, and the manual fallback back to the Drawer.
// A canvas shows a fixture barcode to the decoder, and the frame's seeded lookups answer it:
// the EAN-13 matches and the GS1 DataMatrix is unknown.
const scannerCameras = {
  'ean-13': 'tests/fixtures/barcodes/ean-13.png',
  datamatrix: 'tests/fixtures/barcodes/gs1-datamatrix.png',
}
type ScannerCamera = keyof typeof scannerCameras | 'none' | 'blank' | 'unavailable'

const scannerStates = [
  { state: 'framing', camera: 'none', text: 'Hold the barcode inside the frame' },
  {
    state: 'stalled',
    camera: 'blank',
    text: 'Hold the barcode flat and close, in good light. Or type the details.',
  },
  {
    state: 'unavailable',
    camera: 'unavailable',
    text: 'Camera unavailable. Enter the medication details instead.',
  },
  {
    state: 'no-match',
    camera: 'datamatrix',
    text: "Meddies doesn't know this barcode yet",
    manual: 'Type it in',
  },
] as const

function scannerCapture() {
  const out = process.env.MEDDIES_VISUAL_OUT
  // eslint-disable-next-line playwright/no-skipped-test -- local design review opt-in
  test.skip(
    !out || process.env.MEDDIES_LAB_PREFIX !== '193-b-scanner',
    'Run pnpm lab:capture 193-b-scanner',
  )
  return out!
}

/** Opens the built frame with a stand-in camera. */
async function openScannerFrame(page: Page, camera: ScannerCamera) {
  const image =
    camera in scannerCameras ? scannerCameras[camera as keyof typeof scannerCameras] : null
  const png = image ? (await readFile(resolve(image))).toString('base64') : null
  await page.addInitScript((png) => {
    const camera = new URLSearchParams(location.search).get('camera')
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: async () => {
          if (camera === 'unavailable') throw new DOMException('No camera', 'NotFoundError')
          if (!png && camera !== 'blank') return new Promise(() => {})
          const canvas = document.createElement('canvas')
          canvas.width = 640
          canvas.height = 480
          const context = canvas.getContext('2d')!
          const image = new Image()
          if (png) {
            image.src = `data:image/png;base64,${png}`
            await image.decode()
          }
          const draw = () => {
            context.fillStyle = '#fff'
            context.fillRect(0, 0, canvas.width, canvas.height)
            if (png)
              context.drawImage(
                image,
                (canvas.width - image.width) / 2,
                (canvas.height - image.height) / 2,
              )
          }
          draw()
          setInterval(draw, 100)
          return canvas.captureStream(10)
        },
      },
    })
  }, png)
  await page.setViewportSize(captureCases.phone.viewport)
  await page.goto(`/lab/193-b-scanner?camera=${camera}`)
  const drawer = page.getByRole('dialog', { name: 'Add medication' })
  await expect(drawer).toBeVisible()
  await expect.poll(() => hydrated(page)).toBe(true)
  await expect.poll(() => stylesheetsLoaded(page)).toBe(true)
  await page.addStyleTag({ content: hideDevOverlay })
  await expect(
    drawer.getByText(
      'Meddies uses the camera only to read the barcode. Nothing saves until you do.',
    ),
  ).toBeVisible()
  return {
    drawer,
    scanner: page.getByRole('dialog', { name: 'Scan the pack' }),
    capture: async (out: string, state: string) => {
      const { width, height } = captureCases.phone.viewport
      expect(await scrollsHorizontally(page)).toBe(false)
      await page.screenshot({
        path: resolve(out, `193-b-scanner-${state}-${width}x${height}.png`),
        animations: 'disabled',
        fullPage: true,
      })
    },
  }
}

test('capture the Scan row in Add medicine', { tag: '@visual' }, async ({ page }) => {
  const out = scannerCapture()
  await mkdir(out, { recursive: true })
  const { drawer, capture } = await openScannerFrame(page, 'none')
  await expect(drawer.getByRole('button', { name: 'Scan the pack' })).toBeEnabled()
  await capture(out, 'drawer')
})

for (const { state, camera, text, ...scan } of scannerStates)
  test(
    `capture the Scanner ${state} and its manual fallback`,
    { tag: '@visual' },
    async ({ page }) => {
      const out = scannerCapture()
      await mkdir(out, { recursive: true })
      const { drawer, scanner, capture } = await openScannerFrame(page, camera)
      await drawer.getByRole('button', { name: 'Scan the pack' }).click()
      await expect(scanner.getByRole('heading', { name: 'Scan the pack' })).toBeVisible()
      await expect(scanner.getByText(text, { exact: true })).toBeVisible({ timeout: 15_000 })
      const manual = scanner.getByRole('button', {
        name: 'manual' in scan ? scan.manual : 'Type it in instead',
        exact: true,
      })
      await manual.scrollIntoViewIfNeeded()
      await expect(manual).toBeInViewport()
      await capture(out, state)
      await manual.click()
      await expect(scanner).toBeHidden()
      await expect(drawer.getByRole('textbox', { name: 'Name' })).toHaveValue('')
    },
  )

test('capture Barcode read after a full match', { tag: '@visual' }, async ({ page }) => {
  const out = scannerCapture()
  await mkdir(out, { recursive: true })
  const { drawer, scanner, capture } = await openScannerFrame(page, 'ean-13')
  await drawer.getByRole('button', { name: 'Scan the pack' }).click()
  await expect(scanner).toBeHidden({ timeout: 15_000 })
  await expect(drawer.getByRole('status')).toHaveText(/Barcode read/)
  await expect(drawer.getByRole('textbox', { name: 'Name' })).toHaveValue('MAJEZIK')
  await capture(out, 'barcode-read')
})
