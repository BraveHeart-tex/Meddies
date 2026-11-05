import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'

export const dependencies = { auth: true, storage: true }

const localDate = (date) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Istanbul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)

export async function seed({ db, ownerId }) {
  const today = localDate(new Date())
  const yesterday = new Date(`${today}T12:00:00.000Z`)
  yesterday.setUTCDate(yesterday.getUTCDate() - 1)
  const historyDate = yesterday.toISOString().slice(0, 10)
  const medicineId = randomUUID()
  const scheduleId = randomUUID()
  const slots = [
    { time: '08:00', quantity: 1 },
    { time: '09:00', quantity: 2 },
    { time: '10:00', quantity: 1.5 },
  ]
  const dueAt = (time) => new Date(`${historyDate}T${time}:00+03:00`).toISOString()
  await db
    .prepare('INSERT INTO user_medications(owner_id,id,label,strength,unit) VALUES(?,?,?,?,?)')
    .bind(ownerId, medicineId, 'History Fixture Medicine', '10 mg', 'tablet')
    .run()
  await db
    .prepare(
      'INSERT INTO daily_schedules(owner_id,id,medicine_id,start_date,times,confirmed_at) VALUES(?,?,?,?,?,?)',
    )
    .bind(
      ownerId,
      scheduleId,
      medicineId,
      historyDate,
      JSON.stringify(slots),
      `${historyDate}T00:00:00.000Z`,
    )
    .run()
  await db
    .prepare(
      'INSERT INTO dose_records(owner_id,schedule_id,due_at,taken_at,quantity,outcome) VALUES(?,?,?,?,?,?)',
    )
    .bind(ownerId, scheduleId, dueAt('08:00'), new Date().toISOString(), 0.5, 'Taken')
    .run()
  await db
    .prepare(
      'INSERT INTO skipped_dose_records(owner_id,schedule_id,due_at,recorded_at,outcome) VALUES(?,?,?,?,?)',
    )
    .bind(ownerId, scheduleId, dueAt('09:00'), new Date().toISOString(), 'Skipped')
    .run()
}

export async function run({ origin, browser, artifactDir }) {
  const today = localDate(new Date())
  const previous = new Date(`${today}T12:00:00.000Z`)
  previous.setUTCDate(previous.getUTCDate() - 1)
  const historyDate = previous.toISOString().slice(0, 10)

  browser.step('deny anonymous history access')
  const anonymous = await fetch(`${origin}/history?date=${historyDate}`)
  assert.equal(anonymous.status, 200)
  const anonymousPage = await anonymous.text()
  assert.match(anonymousPage, /Sign in to view dose history/)
  assert.doesNotMatch(anonymousPage, /History Fixture Medicine/)

  browser.step('open history from the signed-in home page')
  await browser.open(origin)
  await browser.run('wait', '--text', 'Dose history')
  await browser.run('click', 'a[href="/history"]')
  await browser.run('wait', '--text', 'Dose history')
  browser.step('submit historical date from the keyboard')
  await browser.run(
    'eval',
    `(() => { const input = document.querySelector('#history-date'); const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; setter.call(input, '${historyDate}'); input.dispatchEvent(new Event('input', { bubbles: true })); input.dispatchEvent(new Event('change', { bubbles: true })); return input.value; })()`,
  )
  await browser.run('focus', 'button[type="submit"]')
  await browser.run('press', 'Enter')
  const submittedUrl = await browser.run('eval', 'window.location.href')
  assert.match(submittedUrl, new RegExp(`date=${historyDate}`))
  await browser.run('wait', '--text', 'History Fixture Medicine')
  const page = browser.snapshot()
  assert.match(page, /Taken/)
  assert.match(page, /Skipped/)
  assert.match(page, /Not logged/)
  const actualIntakeDate = new Intl.DateTimeFormat('en', {
    timeZone: 'Europe/Istanbul',
    dateStyle: 'medium',
  }).format(new Date())
  assert.ok(page.includes(actualIntakeDate), 'Taken outcome should show its actual date')
  assert.match(page, /0\.5 tablet/)
  assert.match(page, /2 tablet/)
  assert.match(page, /1\.5 tablet/)
  assert.match(page, /Back to Today/)
  await browser.run('screenshot', `${artifactDir}/dose-history.png`)

  browser.step('reload and preserve persisted history')
  await browser.run('reload')
  await browser.run('wait', '--text', 'History Fixture Medicine')
  assert.match(browser.snapshot(), /Not logged/)
}
