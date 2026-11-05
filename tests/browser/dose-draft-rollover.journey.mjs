import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { pressButton } from '../helpers/browser-actions.mjs'

export const dependencies = { auth: true, storage: true }
export const initialScheduleTime = '2035-06-15T09:00:00+03:00'

const today = initialScheduleTime.slice(0, 10)
const dueAt = new Date(`${today}T09:05:00+03:00`).toISOString()
const draftTime = `${today}T09:04`
const takenAt = new Date(`${draftTime}:00+03:00`).toISOString()

export async function seed({ db, ownerId }) {
  const medicineId = randomUUID()
  await db
    .prepare('INSERT INTO user_medications(owner_id,id,label,strength,unit) VALUES(?,?,?,?,?)')
    .bind(ownerId, medicineId, 'Rollover Medicine', '10 mg', 'tablet')
    .run()
  await db
    .prepare(
      'INSERT INTO daily_schedules(owner_id,id,medicine_id,start_date,times,confirmed_at) VALUES(?,?,?,?,?,?)',
    )
    .bind(
      ownerId,
      randomUUID(),
      medicineId,
      today,
      JSON.stringify([{ time: '09:05', quantity: 1 }]),
      `${today}T00:00:00.000Z`,
    )
    .run()
}

const doseStatus = (run) =>
  run(
    'eval',
    `document.querySelector('li[data-dose-id]:has(time[datetime="${dueAt}"]) [id^="dose-status-"]')?.innerText ?? ''`,
  )

async function waitForStatus(run, expected) {
  let actual = ''
  for (let attempt = 0; attempt < 40; attempt++) {
    actual = (await doseStatus(run)).trim()
    if (actual.includes(expected)) return
    await new Promise((resolve) => setTimeout(resolve, 150))
  }
  assert.fail(`Dose status: expected ${JSON.stringify(expected)}, actual ${JSON.stringify(actual)}`)
}

export async function run({ origin, browser, setScheduleTime, artifactDir }) {
  browser.step('open an upcoming dose and start a Taken draft')
  await browser.open(origin)
  const rowTrigger = 'li[data-dose-id] button[aria-label^="Record dose for Rollover Medicine"]'
  await browser.run('wait', rowTrigger)
  await waitForStatus(browser.run, 'Scheduled')
  await browser.run('focus', rowTrigger)
  await browser.run('press', 'Enter')
  await pressButton(browser.run, 'I took it')
  await browser.run('wait', '--text', 'Save as taken')
  await pressButton(browser.run, 'Other')
  await browser.setTime('[role="dialog"] input[type="datetime-local"]', draftTime)
  await browser.run('fill', '[role="dialog"] input[type="number"]', '2')

  const assertDraftIntact = async () => {
    assert.equal((await browser.run('get', 'count', '[role="dialog"]')).trim(), '1')
    assert.equal(
      (await browser.run('get', 'value', '[role="dialog"] input[type="number"]')).trim(),
      '2',
    )
    assert.equal(
      (await browser.run('get', 'value', '[role="dialog"] input[type="datetime-local"]')).trim(),
      draftTime,
    )
  }

  browser.step('reach the due time and refresh Today with the draft open')
  await setScheduleTime(`${today}T09:05:00+03:00`)
  await browser.run('eval', 'window.dispatchEvent(new Event("focus"))')
  await waitForStatus(browser.run, 'Due now')
  await assertDraftIntact()

  browser.step('pass the due time and refresh Today with the draft open')
  await setScheduleTime(`${today}T09:06:00+03:00`)
  await browser.run('eval', 'window.dispatchEvent(new Event("focus"))')
  await waitForStatus(browser.run, 'Not logged')
  await browser.run('screenshot', `${artifactDir}/draft-after-rollover.png`)
  await assertDraftIntact()

  browser.step('save the preserved draft')
  await pressButton(browser.run, 'Save as taken')
  await browser.run(
    'wait',
    `li[data-dose-id]:has(time[datetime="${dueAt}"]) time[datetime="${takenAt}"]`,
  )
  await waitForStatus(browser.run, 'Taken')
  assert.match(
    await browser.run(
      'eval',
      `document.querySelector('li[data-dose-id]:has(time[datetime="${dueAt}"])').innerText`,
    ),
    /took 2 tablets/,
  )
  assert.equal((await browser.run('get', 'count', '[role="dialog"]')).trim(), '0')
}
