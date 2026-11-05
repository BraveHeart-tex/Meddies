import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'

export const dependencies = { auth: true, storage: true }

export async function run({ origin, browser, request }) {
  const medicineId = randomUUID()
  const response = await request('/api/medicines', {
    method: 'POST',
    headers: { origin, 'content-type': 'application/json' },
    body: JSON.stringify({
      id: medicineId,
      label: 'Weekday Browser Medicine',
      strength: null,
      unit: 'tablet',
    }),
  })
  assert.equal(response.status, 200)

  await browser.open(origin)
  await browser.run('wait', '--text', 'Set dose schedule')

  await browser.run('select', '#schedule-medicine', medicineId)
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Istanbul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
  const scheduleStart = new Date(`${today}T12:00:00Z`)
  scheduleStart.setUTCDate(scheduleStart.getUTCDate() + 1)
  const startDate = scheduleStart.toISOString().slice(0, 10)
  await browser.run('fill', '#schedule-start', startDate)
  browser.setTime('#dose-time-0', '23:59')
  await browser.run('fill', '#dose-quantity-0', '1')

  browser.step('show accessible feedback for empty weekday selection')
  for (let day = 0; day < 7; day++) await browser.run('uncheck', `#schedule-weekday-${day}`)
  await browser.run('find', 'text', 'Save schedule', 'click', '--exact')
  await browser.run('wait', '--text', 'Choose at least one weekday.')
  const empty = browser.snapshot()
  assert.match(empty, /Choose at least one weekday/)
  assert.equal(
    (await browser.run('get', 'attr', '#schedule-weekdays', 'aria-describedby')).trim(),
    'weekdays-error',
  )

  browser.step('save one weekday and verify it after reload')
  await browser.run('check', '#schedule-weekday-1')
  await browser.run('find', 'text', 'Save schedule', 'click', '--exact')
  await browser.run('wait', '--text', 'Schedule saved.')
  const monday = new Date(`${startDate}T12:00:00Z`)
  while (monday.getUTCDay() !== 1) monday.setUTCDate(monday.getUTCDate() + 1)
  const nextMonday = monday.toISOString().slice(0, 10)
  assert.match(browser.snapshot(), /On Monday at 23:59/)
  await browser.run('wait', '--text', `on ${nextMonday}`)
  assert.match(browser.snapshot(), new RegExp(`on ${nextMonday}`))
  await browser.run('reload')
  await browser.run('wait', '--text', 'On Monday at 23:59')
  const persisted = browser.snapshot()
  assert.match(persisted, /On Monday at 23:59/)
  assert.match(persisted, new RegExp(`on ${nextMonday}`))
}
