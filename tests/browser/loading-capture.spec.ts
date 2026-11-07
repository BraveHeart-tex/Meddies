import { resolve } from 'node:path'
import { captureLoading } from './capture'
import { expect, test } from './fixtures'
import { historyList, rootFallback, todayFallback, todaysDoses } from './locators'
import { addDays, insertScheduledMedicine } from './seed'

// Opt-in loading evidence for design review, never a CI assertion. Run with
// MEDDIES_VISUAL_OUT=<dir> pnpm test:browser:build loading-capture
// Route tickets add their route here and paste loading-capture.json into their issue.
const initialScheduleTime = '2035-06-15T09:00:00+03:00'
const today = initialScheduleTime.slice(0, 10)
const out = process.env.MEDDIES_VISUAL_OUT

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

test('capture loading states for review', async ({ page, app }) => {
  // eslint-disable-next-line playwright/no-skipped-test -- opt-in capture, never a CI assertion
  test.skip(!out, 'Set MEDDIES_VISUAL_OUT to capture loading states')
  test.setTimeout(180_000)
  const summary = await captureLoading(
    page,
    app.worker,
    [
      {
        name: 'today',
        path: '/',
        fallback: todayFallback,
        content: todaysDoses,
      },
      {
        name: 'history',
        path: '/history',
        fallback: rootFallback,
        content: (page) => historyList(page, today),
      },
    ],
    resolve(out!),
  )
  // Two routes, three viewports, two motion settings, fallback and loaded.
  expect(summary).toHaveLength(24)
})
