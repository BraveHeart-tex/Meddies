import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'

export const dependencies = { auth: true, storage: true }

export async function run({ origin, browser, request, artifactDir }) {
  browser.step('seed authenticated fixtures')
  const uuid = randomUUID()
  const medicine = { id: uuid, label: 'Browser Harness Medicine', strength: null, unit: 'tablet' }
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
  const trigger = 'button[aria-label^="Record dose for Browser Harness Medicine"]'
  await browser.run('wait', trigger)
  await browser.run('focus', trigger)
  await browser.run('press', 'Enter')
  await browser.run('wait', '--text', 'Mark as skipped')
  await browser.run('find', 'text', 'Mark as skipped', 'click', '--exact')
  await browser.run('wait', '--text', 'Confirm skipped')
  const confirmation = browser.snapshot()
  assert.match(confirmation, /Confirm skipping Browser Harness Medicine/)
  assert.match(confirmation, /dialog/)
  await browser.run('press', 'Escape')
  const focusedLabel = JSON.parse(
    (await browser.run('eval', 'document.activeElement.getAttribute("aria-label")')).trim(),
  )
  assert.equal(focusedLabel, (await browser.run('get', 'attr', trigger, 'aria-label')).trim())
  await browser.run('press', 'Enter')
  await browser.run('find', 'text', 'Mark as skipped', 'click', '--exact')
  await browser.run('wait', '--text', 'Confirm skipped')
  await browser.run('press', 'Shift+Tab')
  await browser.run('press', 'Enter')
  browser.step('confirm skipped outcome')
  await browser.run('wait', '--text', 'Skipped at')
  browser.step('reload and verify persisted skipped outcome')
  await browser.run('reload')
  await browser.run('wait', '--text', 'Skipped at')
  const page = browser.snapshot()
  assert.match(page, /Skipped at/, 'skip outcome must remain visible after reload')
  assert.match(
    page,
    /Browser Harness Medicine/,
    'persisted dose must remain tied to seeded medicine',
  )

  browser.step('correct the Today outcome back to Taken')
  await browser.run('find', 'text', 'Review dose', 'click', '--exact')
  await browser.run('find', 'text', 'Correct outcome', 'click', '--exact')
  await browser.run('find', 'text', 'Mark as taken', 'click', '--exact')
  await browser.run('wait', '--text', 'Save taken dose')
  await browser.run('find', 'text', 'Save taken dose', 'click', '--exact')
  await browser.run('wait', '--text', 'Taken')
  assert.match(
    await browser.run(
      'eval',
      "document.querySelector('main ul[aria-label] li[data-dose-id]').innerText",
    ),
    /Taken/,
  )
  await browser.run('screenshot', `${artifactDir}/today-corrected.png`)
  await browser.run('reload')
  await browser.run('wait', '--text', 'Taken')
  assert.match(
    await browser.run(
      'eval',
      "document.querySelector('main ul[aria-label] li[data-dose-id]').innerText",
    ),
    /Taken/,
  )
}
