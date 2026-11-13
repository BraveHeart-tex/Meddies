import type { Locator, Page } from '@playwright/test'
import { expect, test } from './fixtures'
import {
  appHeader,
  doseRow,
  historyDateNav as dateNav,
  historyFallbackSection,
  historyList,
} from './locators'
import { addDays, insertScheduledMedicine } from './seed'
import type { WorkerRoute } from './worker-proxy'

// #143: History spaces its header, date bar and day results like Today, with
// DESIGN.md's 20px section spacing rather than the mock's 14px.
const initialScheduleTime = '2035-06-15T09:00:00+03:00'
const today = initialScheduleTime.slice(0, 10)
const startDate = addDays(today, -3)

const historyReads: WorkerRoute[] = [
  { method: 'POST', path: '/schedules', operation: 'listOutcomes' },
  { method: 'POST', path: '/medicines', operation: 'list' },
]

// DESIGN.md section spacing; Today's header-to-content gap is the same.
const sectionGap = 20

test.use({
  journey: {
    auth: true,
    storage: true,
    initialScheduleTime,
    seed: ({ db, ownerId }) =>
      insertScheduledMedicine(db, ownerId, {
        label: 'Spacing Fixture Medicine',
        startDate,
        times: [{ time: '08:00', quantity: 1 }],
      }),
  },
})

const historyDay = (page: Page, name: string) => page.getByRole('region', { name })

/** The vertical space between consecutive page sections, top to bottom. */
async function gaps(...sections: Locator[]) {
  const boxes = await Promise.all(sections.map((section) => section.boundingBox()))
  return boxes.slice(1).map((box, i) => {
    const above = boxes[i]!
    return Math.round((box!.y - (above.y + above.height)) * 10) / 10
  })
}

async function expectSectionGaps(...sections: Locator[]) {
  for (const section of sections) await expect(section).toBeVisible()
  expect(await gaps(...sections)).toEqual(sections.slice(1).map(() => sectionGap))
}

// The 390px width is the ticket's; 320px uses the narrow project's height.
const viewports = [
  { width: 390, height: 844 },
  { width: 320, height: 740 },
]

for (const { width, height } of viewports)
  // eslint-disable-next-line meddies/no-width-loop-tests -- on-request @visual: the layout reflows at each width
  test(
    `History sections are 20px apart and the header matches Today at ${width}px`,
    { tag: '@visual' },
    async ({ page, app }, testInfo) => {
      await page.setViewportSize({ width, height })

      await test.step("the header sits where Today's does", async () => {
        await page.goto('/')
        await expect(doseRow(page, `${today}T05:00:00.000Z`)).toBeVisible()
        const todayHeader = await appHeader(page).boundingBox()
        await page
          .getByRole('navigation', { name: 'Primary' })
          .getByRole('link', { name: 'History' })
          .click()
        await expect(page.getByRole('heading', { level: 1, name: 'History' })).toBeVisible()
        const historyHeader = await appHeader(page).boundingBox()
        expect({ x: historyHeader!.x, y: historyHeader!.y, width: historyHeader!.width }).toEqual({
          x: todayHeader!.x,
          y: todayHeader!.y,
          width: todayHeader!.width,
        })
      })

      await test.step('loaded day', async () => {
        const yesterday = addDays(today, -1)
        await page.goto(`/history?date=${yesterday}`)
        const loaded = historyDay(page, 'Thursday, 14 June, 1 dose')
        await expectSectionGaps(appHeader(page), dateNav(page), loaded)
        // Inside the day, the heading stays 14px above its rows.
        const heading = loaded.getByRole('heading', { level: 2 })
        expect(await gaps(heading, historyList(page, yesterday))).toEqual([14])
        await page.screenshot({ path: testInfo.outputPath(`history-loaded-${width}.png`) })
      })

      await test.step('empty day', async () => {
        await page.goto(`/history?date=${addDays(startDate, -1)}`)
        await expectSectionGaps(
          appHeader(page),
          dateNav(page),
          historyDay(page, 'Nothing was scheduled on Monday, 11 June'),
        )
        await page.screenshot({ path: testInfo.outputPath(`history-empty-${width}.png`) })
      })

      await test.step('invalid-date notice above today', async () => {
        await page.goto('/history?date=2035-12-24')
        await expectSectionGaps(
          appHeader(page),
          dateNav(page),
          page.getByRole('alert').filter({ hasText: 'Nothing to show for that day.' }),
          historyDay(page, 'Friday, 15 June, 1 dose'),
        )
        await page.screenshot({ path: testInfo.outputPath(`history-invalid-${width}.png`) })
      })

      await test.step('results fallback', async () => {
        for (const route of historyReads) app.worker.hold(route)
        await page.goto('/history', { waitUntil: 'commit' })
        await expectSectionGaps(appHeader(page), dateNav(page), historyFallbackSection(page))
        app.worker.release()
      })

      await test.step('unavailable day', async () => {
        for (const route of historyReads) app.worker.fail(route, 503)
        await page.goto('/history')
        await expectSectionGaps(
          appHeader(page),
          dateNav(page),
          historyDay(page, "History for Today, Fri 15 Jun didn't load just now."),
        )
        app.worker.clear()
      })
    },
  )
