import assert from 'node:assert/strict'
import { pressButton } from '../helpers/browser-actions.mjs'
import { randomUUID } from 'node:crypto'

export const dependencies = { auth: true, storage: true }

export async function run({ origin, browser, request, artifactDir }) {
  browser.step('seed authenticated fixtures')
  const uuid = randomUUID()
  const label = 'M'.repeat(120)
  const medicine = { id: uuid, label, strength: null, unit: 'tablet' }
  let response = await request('/api/medicines', {
    method: 'POST',
    headers: { origin, 'content-type': 'application/json' },
    body: JSON.stringify(medicine),
  })
  assert.equal(response.status, 200, 'fixture medicine must save through authenticated app API')
  const localToday = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Istanbul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
  const future = new Date(Date.now() + 60_000)
  const futureDate = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Istanbul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(future)
  assert.equal(
    futureDate,
    localToday,
    'today-skipped fixture needs at least one minute before Istanbul midnight',
  )
  const time = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Istanbul',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(future)
  response = await request('/api/schedules', {
    method: 'POST',
    headers: { origin, 'content-type': 'application/json' },
    body: JSON.stringify({
      id: randomUUID(),
      medicineId: uuid,
      startDate: localToday,
      times: [{ time, quantity: 1 }],
    }),
  })
  assert.equal(response.status, 200, 'fixture schedule must save through authenticated app API')

  browser.step('open Today and show skip confirmation with keyboard')
  await browser.open(origin)
  await browser.run('wait', '--text', 'Today')
  const trigger = `button[aria-label^="Record dose for ${label}"]`
  await browser.run('wait', trigger)
  await browser.run('focus', trigger)
  await browser.run('press', 'Enter')
  await browser.run('wait', '[data-slot="toggle-group-item"]')
  await pressButton(browser.run, 'I skipped it')
  await browser.run('wait', '--text', 'Save as skipped')
  const confirmation = await browser.snapshot()
  assert.ok(confirmation.includes(`Confirm skipping ${label}`))
  assert.match(confirmation, /dialog/)
  await browser.run('press', 'Escape')
  // Base UI returns focus to the opener once the sheet's exit transition finishes.
  await browser.run('wait', '--fn', '!document.querySelector("[role=dialog]")')
  const focusedLabel = JSON.parse(
    (await browser.run('eval', 'document.activeElement.getAttribute("aria-label")')).trim(),
  )
  assert.equal(focusedLabel, (await browser.run('get', 'attr', trigger, 'aria-label')).trim())
  await browser.run('press', 'Enter')
  await pressButton(browser.run, 'I skipped it')
  await browser.run('wait', '--text', 'Save as skipped')
  await browser.run('press', 'Shift+Tab')
  await browser.run('press', 'Enter')
  browser.step('confirm skipped outcome')
  await browser.run('wait', '--text', 'as skipped.')
  assert.ok((await browser.run('get', 'text', 'main [role="status"]')).includes(label))
  assert.equal(
    (await browser.run('eval', 'document.documentElement.scrollWidth <= window.innerWidth')).trim(),
    'true',
    'the confirmation must fit the viewport with a 120-character unbroken name',
  )
  browser.step('reload and verify persisted skipped outcome')
  await browser.run('reload')
  await browser.run('wait', 'li[data-dose-id] [data-slot="badge"] time')
  const page = await browser.snapshot()
  assert.match(
    JSON.parse(
      await browser.run('eval', "document.querySelector('main li[data-dose-id]').innerText"),
    ),
    /Skipped\s+\d\d:\d\d/,
    'skip outcome must remain visible after reload',
  )
  assert.ok(page.includes(label), 'persisted dose must remain tied to seeded medicine')

  browser.step('correct the Today outcome back to Taken')
  const reviewTrigger = `button[aria-label^="Review dose for ${label}"]`
  await browser.run('focus', reviewTrigger)
  await browser.run('press', 'Enter')
  await pressButton(browser.run, 'Correct outcome')
  await browser.run('wait', '[data-slot="toggle-group-item"]')
  await pressButton(browser.run, 'I took it')
  await browser.run('wait', '--text', 'Save as taken')
  await browser.run('focus', '[role="dialog"] button[type="submit"]')
  await browser.run('press', 'Enter')
  await browser.run('wait', '--text', 'as taken.')
  assert.match(
    await browser.run(
      'eval',
      "document.querySelector('main ul[aria-label] li[data-dose-id]').innerText",
    ),
    /Taken/,
  )
  await browser.run('screenshot', `${artifactDir}/today-corrected.png`)
  await browser.run('reload')
  await browser.run('wait', 'li[data-dose-id] [data-slot="badge"] time')
  assert.match(
    await browser.run(
      'eval',
      "document.querySelector('main ul[aria-label] li[data-dose-id]').innerText",
    ),
    /Taken/,
  )
}
