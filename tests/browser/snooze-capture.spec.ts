import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { test, expect } from './fixtures'
import { insertScheduledMedicine } from './seed'
import { drawer } from './locators'
import { hydrated, scrollsHorizontally } from './actions'
import { captureSettled } from './settled-capture'

// Opt-in visual/keyboard review of production #397 against 382·C1-C4. No CI journey.
const out = process.env.MEDDIES_VISUAL_OUT
const scheduleId = '00000000-0000-4000-8000-000000000397'
test.use({
  journey: {
    auth: true,
    storage: true,
    initialScheduleTime: '2035-06-15T10:00:00+03:00',
    seed: async ({ db, ownerId }) => {
      await insertScheduledMedicine(db, ownerId, {
        label: 'Salbutamol',
        startDate: '2035-06-14',
        times: [
          { time: '09:00', quantity: 1 },
          { time: '22:00', quantity: 1 },
        ],
        scheduleId,
      })
    },
  },
})

test('capture Snooze drawer and keyboard recovery', { tag: '@visual' }, async ({ page, app }) => {
  // eslint-disable-next-line playwright/no-skipped-test -- opt-in visual evidence
  test.skip(!out, 'Set MEDDIES_VISUAL_OUT')
  await mkdir(resolve(out!), { recursive: true })
  await page.goto('/')
  await expect.poll(() => hydrated(page)).toBe(true)
  const trigger = page.getByRole('button', {
    name: 'Record dose for Salbutamol scheduled at 09:00',
    exact: true,
  })
  await trigger.focus()
  await page.keyboard.press('Enter')
  await expect(drawer(page).getByRole('heading', { name: 'Salbutamol' })).toBeFocused()
  const snooze = page.getByRole('button', {
    name: 'Snooze dose for Salbutamol scheduled at 09:00, 40 min',
  })
  await expect(snooze).toBeVisible()
  await page.mouse.move(0, 0)
  await captureSettled(page, {
    style: 'nextjs-portal { display: none !important; }',
    path: resolve(out!, '397-c1.png'),
  })
  // Keyboard reaches Snooze after Cancel and returns to its opener on dismissal.
  await page.getByRole('button', { name: 'Cancel', exact: true }).focus()
  await page.keyboard.press('Tab')
  await expect(snooze).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.getByText('Turn on notifications to snooze.')).toBeVisible()
  await page.mouse.move(0, 0)
  await captureSettled(page, {
    style: 'nextjs-portal { display: none !important; }',
    path: resolve(out!, '397-c4.png'),
  })
  await page.getByRole('link', { name: 'Open Settings' }).focus()
  await expect(page.getByRole('link', { name: 'Open Settings' })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(drawer(page)).toBeHidden()
  await expect(trigger).toBeFocused()

  // Register a synthetic installation through the same authenticated API the settings use.
  const registration = await app.api('PUT', '/api/device-registration', {
    installationId: 'c'.padEnd(22, 'a'),
    token: 'snooze-visual-synthetic-token-1234567890',
  })
  expect(registration.ok()).toBe(true)
  await trigger.click()
  await snooze.click()
  await expect(page.getByText('Reminder at', { exact: false })).toHaveText('Reminder at 10:40')
  await expect(snooze).toHaveCount(0)
  await page.mouse.move(0, 0)
  await captureSettled(page, {
    style: 'nextjs-portal { display: none !important; }',
    path: resolve(out!, '397-c2.png'),
  })
  await page.keyboard.press('Escape')

  // A new date leaves the earlier accepted Snooze alone and exercises the real Quiet hours result.
  await app.setScheduleTime('2035-06-16T22:30:00+03:00')
  const quiet = await app.api('PUT', '/api/quiet-hours', {
    actionId: '00000000-0000-4000-8000-000000000399',
    quietHours: true,
  })
  expect(quiet.ok()).toBe(true)
  await page.goto('/history?date=2035-06-16')
  await page.getByRole('button', { name: 'Record dose for Salbutamol scheduled at 22:00' }).click()
  await page
    .getByRole('button', { name: 'Snooze dose for Salbutamol scheduled at 22:00, 40 min' })
    .click()
  await expect(page.getByText('No reminder', { exact: true })).toBeVisible()
  await expect(page.getByText('23:10 is in quiet hours.')).toBeVisible()
  await page.mouse.move(0, 0)
  await captureSettled(page, {
    style: 'nextjs-portal { display: none !important; }',
    path: resolve(out!, '397-c3.png'),
  })
  expect(await scrollsHorizontally(page)).toBe(false)
})
