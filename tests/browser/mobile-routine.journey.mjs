import assert from 'node:assert/strict'

export const dependencies = { auth: true, storage: true }
export const initialScheduleTime = '2035-06-15T09:00:00+03:00'

const today = initialScheduleTime.slice(0, 10)
const time = '09:05'
const dueAt = new Date(`${today}T${time}:00+03:00`).toISOString()
const takenAt = new Date(initialScheduleTime).toISOString()

export async function run({ origin, browser, setScheduleTime }) {
  browser.step('open signed-in Today and check primary navigation')
  await browser.open(origin)
  await browser.run('wait', '--text', 'Today')
  assert.match(await browser.snapshot(), /Primary/)
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
  assert.match(await browser.snapshot(), /Medicine: Routine Medicine/)

  browser.step('retry an uncertain schedule save without losing setup')
  await browser.setTime('#schedule-start', today)
  await browser.setTime('#dose-time-0', time)
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
  const routineView = await browser.snapshot()
  assert.equal(routineView.match(new RegExp(`Daily at ${time}`, 'g'))?.length, 1)

  browser.step('record the scheduled dose before it is due')
  await browser.run('click', 'nav a[href="/"]')
  const takeButton = 'button[aria-label^="Record dose for Routine Medicine"]'
  await browser.run('wait', takeButton)
  await browser.run('focus', takeButton)
  await browser.run('press', 'Enter')
  await browser.run('find', 'role', 'button', 'click', '--name', 'I took it', '--exact')
  await browser.run('wait', '--text', 'Save as taken')
  assert.match(await browser.snapshot(), /dialog/)
  await browser.run('find', 'role', 'button', 'click', '--name', 'Other', '--exact')
  await browser.setTime('input[type="datetime-local"]', initialScheduleTime.slice(0, 16))
  await browser.run('focus', 'button[type="submit"]')
  await browser.run('press', 'Enter')
  await browser.run(
    'wait',
    `li[data-dose-id]:has(time[datetime="${dueAt}"]) time[datetime="${takenAt}"]`,
  )

  const historyUrl = `${origin}/history?date=${today}`
  const historyRows = `ol[aria-label="Doses for ${today}"] > li`
  const scheduledRow = `${historyRows}:has(time[datetime="${dueAt}"])`
  const assertHistoryDose = async (status) => {
    await browser.run('wait', scheduledRow)
    assert.equal((await browser.run('get', 'url')).trim(), historyUrl)
    assert.equal((await browser.run('get', 'value', '#history-date')).trim(), today)
    assert.equal((await browser.run('get', 'count', historyRows)).trim(), '1')
    const row = await browser.run('get', 'text', scheduledRow)
    assert.match(row, /Routine Medicine/)
    assert.match(row, new RegExp(`^${status}$`, 'm'))
  }

  browser.step('verify the recorded dose is absent from dated History before it is due')
  await browser.open(historyUrl)
  await browser.run('wait', '--text', 'No past doses for this date.')
  assert.equal((await browser.run('get', 'value', '#history-date')).trim(), today)
  assert.equal((await browser.run('get', 'count', historyRows)).trim(), '0')

  browser.step('advance past the due time and find the taken dose in dated History')
  await setScheduleTime(`${today}T09:06:00+03:00`)
  await browser.run('reload')
  await assertHistoryDose('Taken')

  browser.step('correct the History dose and verify it persists after reload')
  await browser.run('find', 'text', 'Review dose', 'click', '--exact')
  await browser.run('find', 'text', 'Correct outcome', 'click', '--exact')
  await browser.run('find', 'role', 'button', 'click', '--name', 'I skipped it', '--exact')
  await browser.run('wait', '--text', 'Save as skipped')
  await browser.run('find', 'text', 'Save as skipped', 'click', '--exact')
  await browser.run('wait', '--text', 'Skipped')
  await assertHistoryDose('Skipped')
  await browser.run('reload')
  await assertHistoryDose('Skipped')

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
  assert.match(await browser.snapshot(), /Evening Vitamin/)

  browser.step('recover from session expiry on Settings')
  await browser.run('click', 'a[href="/settings"]')
  await browser.run('wait', '--text', 'Private account access')
  assert.match(await browser.snapshot(), /Sign out/)
  await browser.expireSession()
  await browser.run('eval', 'window.dispatchEvent(new Event("focus"))')
  await browser.run('wait', '--text', 'Your routine, in your hands')
  assert.match(await browser.snapshot(), /session ended/i)
  assert.match(await browser.run('eval', 'window.location.search'), /returnTo=%2Fsettings/)
}
