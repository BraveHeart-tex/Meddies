import assert from 'node:assert/strict'
import { setTimeout as delay } from 'node:timers/promises'

export const dependencies = { auth: true, storage: true }

const localDate = (date) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Istanbul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)

export async function run({ origin, browser }) {
  browser.step('open signed-in Today and check primary navigation')
  await browser.open(origin)
  await browser.run('wait', '--text', 'Today')
  assert.match(browser.snapshot(), /Primary/)
  await browser.run('click', 'nav a[href="/medications"]')
  await browser.run('wait', '--text', 'Medications')
  await browser.run('fill', '#medicine-label', 'Routine Medicine')
  await browser.run('fill', '#medicine-strength', '5 mg')
  await browser.run('focus', 'button[type="submit"]')
  await browser.run('press', 'Enter')
  await browser.run('wait', '--text', 'Routine Medicine is saved.')
  const scheduleLink = '[aria-label="Saved medicine"] a[href^="/medications?schedule="]'
  const scheduleHref = (await browser.run('get', 'attr', scheduleLink, 'href')).trim()
  const medicineId = new URL(scheduleHref, origin).searchParams.get('schedule')
  assert.ok(medicineId)
  await browser.run('focus', scheduleLink)
  await browser.run('press', 'Enter')
  await browser.run('wait', '--text', 'Set dose schedule')
  assert.match(browser.snapshot(), /Medicine: Routine Medicine/)

  browser.step('retry an uncertain schedule save without losing setup')
  const future = new Date(Date.now() + 60_000)
  const today = localDate(new Date())
  assert.equal(
    localDate(future),
    today,
    'routine fixture needs one minute before Istanbul midnight',
  )
  const time = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Istanbul',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(future)
  browser.run(
    'eval',
    `(() => { const field = document.querySelector('#schedule-start'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(field, ${JSON.stringify(today)}); field.dispatchEvent(new Event('input', { bubbles: true })); field.dispatchEvent(new Event('change', { bubbles: true })); })()`,
  )
  assert.equal((await browser.run('get', 'value', '#schedule-start')).trim(), today)
  browser.setTime('#dose-time-0', time)
  await browser.run('fill', '#dose-quantity-0', '1')

  await browser.run(
    'eval',
    `(() => { const original = window.fetch.bind(window); let loseResponse = true; window.fetch = (input, init) => { if (loseResponse && String(input).includes('/api/schedules') && init?.method === 'POST') { loseResponse = false; return original(input, init).then(() => Promise.reject(new TypeError('connection lost after save'))); } return original(input, init); }; })()`,
  )
  await browser.run('focus', 'button[type="submit"]')
  await browser.run('press', 'Enter')
  await browser.run('wait', '--text', 'Save could not be confirmed.')
  assert.equal((await browser.run('get', 'value', '#dose-time-0')).trim(), time)
  await browser.run('focus', 'button[type="submit"]')
  await browser.run('press', 'Enter')
  await browser.run('wait', '--text', 'Schedule saved.')
  await browser.run('reload')
  await browser.run('wait', '--text', `Daily at ${time}`)
  const routineView = browser.snapshot()
  assert.equal(routineView.match(new RegExp(`Daily at ${time}`, 'g'))?.length, 1)

  browser.step('record dose on Today')
  await browser.run('click', 'nav a[href="/"]')
  const takeButton = 'button[aria-label^="Record dose for Routine Medicine"]'
  await browser.run('wait', takeButton)
  await browser.run('focus', takeButton)
  await browser.run('press', 'Enter')
  await browser.run('find', 'text', 'Mark as taken', 'click', '--exact')
  await browser.run('wait', '--text', 'Save taken dose')
  assert.match(browser.snapshot(), /dialog/)
  await browser.run('focus', 'button[type="submit"]')
  await browser.run('press', 'Enter')
  await browser.run('wait', '--text', 'Taken')
  const dueAt = new Date(`${today}T${time}:00+03:00`).getTime()
  while (Date.now() < dueAt) {
    await delay(Math.min(20_000, dueAt - Date.now()))
    await browser.run('snapshot')
  }

  browser.step('review dated history and correct the outcome')
  await browser.run('click', 'nav a[href="/history"]')
  await browser.run('wait', '--text', 'Dose history')
  await browser.run('wait', '--text', 'Routine Medicine')
  assert.match(browser.snapshot(), new RegExp(today))
  await browser.run('find', 'text', 'Review dose', 'click', '--exact')
  await browser.run('find', 'text', 'Correct outcome', 'click', '--exact')
  await browser.run('find', 'text', 'Mark as skipped', 'click', '--exact')
  await browser.run('wait', '--text', 'Confirm skipped')
  await browser.run('find', 'text', 'Confirm skipped', 'click', '--exact')
  await browser.run('wait', '--text', 'Skipped')
  assert.match(browser.snapshot(), /Scheduled/)

  browser.step('save another medicine without a schedule and reload')
  await browser.run('click', 'nav a[href="/medications"]')
  await browser.run('wait', '#medicine-label')
  await browser.run('fill', '#medicine-label', 'Evening Vitamin')
  await browser.run('focus', 'button[type="submit"]')
  await browser.run('press', 'Enter')
  await browser.run('wait', '--text', 'Evening Vitamin is saved.')
  await browser.run('find', 'text', 'Done for now', 'click', '--exact')
  await browser.run('reload')
  await browser.run('wait', '--text', 'Evening Vitamin')
  await browser.run(
    'eval',
    `(() => { const link = [...document.querySelectorAll('a[href^="/medications?medicine="]')].find((item) => item.closest('li')?.innerText.includes('Evening Vitamin')); link?.click(); })()`,
  )
  await browser.run('wait', '--text', 'No schedule saved yet.')
  assert.match(browser.snapshot(), /Evening Vitamin/)

  browser.step('recover from session expiry on Settings')
  await browser.run('click', 'a[href="/settings"]')
  await browser.run('wait', '--text', 'Private account access')
  assert.match(browser.snapshot(), /Sign out/)
  await browser.expireSession()
  await browser.run('eval', 'window.dispatchEvent(new Event("focus"))')
  await browser.run('wait', '--text', 'Your routine, in your hands')
  assert.match(browser.snapshot(), /session ended/i)
  assert.match(await browser.run('eval', 'window.location.search'), /returnTo=%2Fsettings/)
}
