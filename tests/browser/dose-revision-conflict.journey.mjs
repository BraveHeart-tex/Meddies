import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { pressButton } from '../helpers/browser-actions.mjs'

export const dependencies = { auth: true, storage: true }
export const initialScheduleTime = '2035-06-15T12:00:00+03:00'

const today = initialScheduleTime.slice(0, 10)
const dueAt = new Date(`${today}T08:00:00+03:00`).toISOString()
const scheduleId = randomUUID()
const row = `li[data-dose-id]:has(time[datetime="${dueAt}"])`

export async function seed({ db, ownerId }) {
  const medicineId = randomUUID()
  await db
    .prepare('INSERT INTO user_medications(owner_id,id,label,strength,unit) VALUES(?,?,?,?,?)')
    .bind(ownerId, medicineId, 'Conflict Medicine', '10 mg', 'tablet')
    .run()
  await db
    .prepare(
      'INSERT INTO daily_schedules(owner_id,id,medicine_id,start_date,times,confirmed_at) VALUES(?,?,?,?,?,?)',
    )
    .bind(
      ownerId,
      scheduleId,
      medicineId,
      today,
      JSON.stringify([{ time: '08:00', quantity: 1 }]),
      `${today}T00:00:00.000Z`,
    )
    .run()
  await db
    .prepare(
      'INSERT INTO dose_records(owner_id,schedule_id,due_at,taken_at,quantity,outcome) VALUES(?,?,?,?,?,?)',
    )
    .bind(ownerId, scheduleId, dueAt, dueAt, 1, 'Taken')
    .run()
}

const rowText = (run) => run('eval', `document.querySelector('${row}')?.innerText ?? ''`)

export async function run({ origin, browser, request, artifactDir }) {
  browser.step('start correcting a Taken dose to Skipped')
  await browser.open(origin)
  const rowTrigger = `${row} button[data-row-trigger]`
  await browser.run('wait', rowTrigger)
  assert.match(await rowText(browser.run), /Taken/)
  await browser.run('focus', rowTrigger)
  await browser.run('press', 'Enter')
  await pressButton(browser.run, 'Correct outcome')
  await pressButton(browser.run, 'I skipped it')
  await browser.run('wait', '--text', 'Save as skipped')

  browser.step('change the same dose elsewhere while the correction is open')
  const elsewhere = await request('/api/schedules', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Origin: origin },
    body: JSON.stringify({
      actionId: randomUUID(),
      expectedRevision: 0,
      expectedOutcome: 'Taken',
      outcome: 'Taken',
      takenAt: dueAt,
      quantity: 2,
      scheduleId,
      dueAt,
    }),
  })
  assert.equal(elsewhere.status, 200, `Concurrent correction failed: ${await elsewhere.text()}`)

  browser.step('save the stale correction and get explicit recovery')
  await pressButton(browser.run, 'Save as skipped')
  await browser.run('wait', '--text', 'This dose changed elsewhere.')
  let dialogs = ''
  for (let attempt = 0; attempt < 40 && dialogs !== '0'; attempt++) {
    dialogs = (await browser.run('get', 'count', '[role="dialog"]')).trim()
    if (dialogs !== '0') await new Promise((resolve) => setTimeout(resolve, 150))
  }
  assert.equal(dialogs, '0', 'Conflict should close the correction sheet')
  const recovery = await rowText(browser.run)
  assert.match(recovery, /Your correction was not saved/)
  assert.match(recovery, /Review current outcome/)
  assert.match(recovery, /Taken/)
  assert.match(recovery, /took 2 tablets/)
  assert.doesNotMatch(recovery, /Skipped/)
  assert.equal(
    (await browser.run('eval', 'document.activeElement?.hasAttribute("data-row-trigger")')).trim(),
    'true',
  )
  await browser.run('screenshot', `${artifactDir}/revision-conflict.png`)

  browser.step('review the current outcome and correct it again')
  await pressButton(browser.run, 'Review current outcome')
  await browser.run('focus', rowTrigger)
  await browser.run('press', 'Enter')
  await browser.run('wait', '--text', 'Taken 2 tablets')
  await pressButton(browser.run, 'Correct outcome')
  await pressButton(browser.run, 'I skipped it')
  await pressButton(browser.run, 'Save as skipped')
  await browser.run('wait', `${row} [id^="dose-status-"]`)
  let status = ''
  for (let attempt = 0; attempt < 40 && !/Skipped/.test(status); attempt++) {
    status = await rowText(browser.run)
    await new Promise((resolve) => setTimeout(resolve, 150))
  }
  assert.match(status, /Skipped/)

  browser.step('reload and keep the corrected outcome')
  await browser.run('reload')
  await browser.run('wait', rowTrigger)
  assert.match(await rowText(browser.run), /Skipped/)
}
