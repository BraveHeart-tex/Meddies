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
      label: `Weekday Browser Medicine ${'M'.repeat(90)}`,
      strength: 'S'.repeat(120),
      unit: 'tablet',
    }),
  })
  assert.equal(response.status, 200)

  await browser.open(`${origin}/medications?schedule=${medicineId}`)
  await browser.run('wait', '--text', 'Set dose schedule')
  await browser.run('wait', '--text', 'Medicine: Weekday Browser Medicine')
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Istanbul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
  const scheduleStart = new Date(`${today}T12:00:00Z`)
  scheduleStart.setUTCDate(scheduleStart.getUTCDate() + 1)
  const startDate = scheduleStart.toISOString().slice(0, 10)
  await browser.run(
    'eval',
    `(() => { const field = document.querySelector('#schedule-start'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(field, ${JSON.stringify(startDate)}); field.dispatchEvent(new Event('input', { bubbles: true })); field.dispatchEvent(new Event('change', { bubbles: true })); })()`,
  )
  assert.equal((await browser.run('get', 'value', '#schedule-start')).trim(), startDate)
  await browser.setTime('#dose-time-0', '23:59')
  await browser.run('fill', '#dose-quantity-0', '1')

  browser.step('show accessible feedback for empty weekday selection')
  for (let day = 0; day < 7; day++) await browser.run('uncheck', `#schedule-weekday-${day}`)
  await browser.run('find', 'text', 'Save schedule', 'click', '--exact')
  await browser.run('wait', '--text', 'Choose at least one weekday.')
  const empty = await browser.snapshot()
  assert.match(empty, /Choose at least one weekday/)
  assert.equal(
    (await browser.run('get', 'attr', '#schedule-weekdays', 'aria-describedby')).trim(),
    'weekdays-error',
  )

  browser.step('save one weekday')
  await browser.run('check', '#schedule-weekday-1')
  await browser.run('find', 'text', 'Save schedule', 'click', '--exact')
  await browser.run('wait', '--text', 'Schedule saved.')
  const monday = new Date(`${startDate}T12:00:00Z`)
  while (monday.getUTCDay() !== 1) monday.setUTCDate(monday.getUTCDate() + 1)
  const nextMonday = monday.toISOString().slice(0, 10)
  browser.step('check next Istanbul occurrence on Today')
  await browser.run('click', 'nav a[href="/"]')
  await browser.run('wait', '--text', `on ${nextMonday}`)
  assert.match(await browser.snapshot(), new RegExp(`on ${nextMonday}`))
  browser.step('open medicine detail and verify the saved routine')
  await browser.run('click', 'nav a[href="/medications"]')
  const detail = `a[href="/medications?medicine=${medicineId}"]`
  await browser.run('wait', detail)
  await browser.run('focus', detail)
  await browser.run('press', 'Enter')
  await browser.run('wait', '--text', 'Saved routine')
  assert.equal(new URL(await browser.run('get', 'url')).searchParams.get('medicine'), medicineId)
  assert.match(await browser.snapshot(), /On Monday at 23:59/)
  browser.step('reload the medicine detail')
  await browser.run('reload')
  await browser.run('wait', '--text', 'On Monday at 23:59')
  const persisted = await browser.snapshot()
  assert.match(persisted, /On Monday at 23:59/)
  assert.match(persisted, new RegExp(`Starts ${startDate}`))
  assert.equal(
    JSON.parse(
      await browser.run(
        'eval',
        'document.documentElement.scrollWidth <= document.documentElement.clientWidth',
      ),
    ),
    true,
    'long medicine labels must reflow without horizontal scrolling',
  )
}
