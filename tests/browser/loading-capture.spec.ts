import { resolve } from 'node:path'
import { captureCases, captureLoading, type CaptureRoute } from './capture'
import { expect, test } from './fixtures'
import {
  historyDateNav,
  historyFallback,
  historyList,
  historyRouteFallback,
  medicationsFallback,
  medicationsList,
  settingsRouteFallback,
  signInRouteFallback,
  todayFallback,
  todaysDoses,
} from './locators'
import { addDays, insertScheduledMedicine } from './seed'
import { routeRender } from './worker-proxy'

// Opt-in loading evidence for design review, never a CI assertion. Run with
// MEDDIES_VISUAL_OUT=<dir> pnpm test:browser:build loading-capture
// Route tickets register routes here; the wave gate links consolidated review evidence.
const initialScheduleTime = '2035-06-15T09:00:00+03:00'
const today = initialScheduleTime.slice(0, 10)
const out = process.env.MEDDIES_VISUAL_OUT

const routes: CaptureRoute[] = [
  { name: 'today', path: '/', fallback: todayFallback, content: todaysDoses },
  {
    name: 'history',
    path: '/history',
    fallback: historyFallback,
    content: (page) => historyList(page, today),
  },
  {
    name: 'medications',
    path: '/medications',
    fallback: medicationsFallback,
    content: medicationsList,
  },
  {
    name: 'history-route',
    path: '/history',
    hold: routeRender('history'),
    fallback: historyRouteFallback,
    content: historyDateNav,
  },
  {
    name: 'settings',
    path: '/settings',
    hold: routeRender('settings'),
    fallback: settingsRouteFallback,
    content: (page) => page.getByText('Signed in with your approved Google account'),
  },
  {
    name: 'sign-in-error',
    path: '/sign-in/error?error=AccessDenied',
    hold: routeRender('sign-in-error'),
    fallback: signInRouteFallback,
    content: (page) => page.getByRole('alert').filter({ hasText: "can't open Meddies" }),
  },
]

function selectNamed<T extends { name: string }>(available: T[], selection: string | undefined) {
  if (selection === undefined) return available
  return [...new Set(selection.split(',').map((name) => name.trim()))].map((name) => {
    const item = available.find((item) => item.name === name)
    if (!item) throw new Error(`Unknown capture selection ${JSON.stringify(name)}`)
    return item
  })
}

test.use({
  journey: {
    auth: true,
    storage: true,
    initialScheduleTime,
    seed: ({ db, ownerId }) =>
      insertScheduledMedicine(db, ownerId, {
        label: 'Capture Fixture Medicine',
        startDate: addDays(today, -1),
        times: [{ time: '08:00', quantity: 1 }],
      }),
  },
})

test('capture loading states for review', { tag: '@visual' }, async ({ page, app }) => {
  // eslint-disable-next-line playwright/no-skipped-test -- opt-in capture, never a CI assertion
  test.skip(!out, 'Set MEDDIES_VISUAL_OUT to capture loading states')
  test.setTimeout(180_000)
  const selectedRoutes = selectNamed(routes, process.env.MEDDIES_CAPTURE_ROUTES)
  const selectedCases = selectNamed(
    Object.values(captureCases),
    process.env.MEDDIES_CAPTURE_CASES ?? 'phone',
  )
  const summary = await captureLoading(
    page,
    app.worker,
    selectedRoutes,
    resolve(out!),
    selectedCases,
  )
  expect(summary).toHaveLength(selectedRoutes.length * selectedCases.length * 2)
  for (const route of selectedRoutes)
    for (const captureCase of selectedCases) {
      const entries = summary.filter(
        (entry) => entry.route === route.name && entry.captureCase === captureCase.name,
      )
      expect(entries.map((entry) => entry.stage)).toEqual(['fallback', 'loaded'])
      for (const entry of entries) {
        expect(entry.path).toBe(route.path)
        expect(entry.viewport).toBe(`${captureCase.viewport.width}x${captureCase.viewport.height}`)
        expect(entry.reducedMotion).toBe(captureCase.reducedMotion)
        expect(entry.screenshot).toBe(`${route.name}-${entry.stage}-${captureCase.name}.png`)
      }
    }
})
