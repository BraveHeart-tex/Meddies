import {
  istanbulDate,
  type DoseOccurrence,
  type ScheduleCommand,
  type ScheduleResponse,
} from '../src/features/schedules/contract'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'vitest'
import { createScheduleOperations } from '../src/features/schedules/operations'
import {
  startWorkerRuntime,
  runtime,
  secret,
  legacy,
  versionFixture,
} from './helpers/medicine-storage-runtime'

// Schedule versions, edits and Last day on real D1.
startWorkerRuntime()

/** Today's own doses; yesterday's unresolved backlog in To log (#275) is covered elsewhere. */
const todays = (snapshot: { today: { date: string; doses: DoseOccurrence[] } }) =>
  snapshot.today.doses.filter((dose) => istanbulDate(new Date(dose.dueAt)) === snapshot.today.date)

test('Schedule versions preserve the D3 Edit time boundary and list only the current version', async () => {
  for (const [editTime, oldTime, newTime, expected] of [
    ['05:59:59', '09:00', '10:00', ['2026-11-03T07:00:00.000Z']],
    ['06:00:00', '09:00', '10:00', ['2026-11-03T06:00:00.000Z', '2026-11-03T07:00:00.000Z']],
    ['06:00:01', '09:00', '10:00', ['2026-11-03T06:00:00.000Z', '2026-11-03T07:00:00.000Z']],
    ['06:00:00', '10:00', '09:00', []],
  ] as const) {
    const f = await versionFixture()
    const id = randomUUID()
    await f.operations.save({
      id,
      medicineId: f.medicineId,
      startDate: '2026-11-02',
      times: [{ time: oldTime, quantity: 1 }],
    })
    f.setNow(`2026-11-03T${editTime}.000Z`)
    const editedId = randomUUID()
    await f.operations.edit({
      id: editedId,
      basedOnId: id,
      endDate: null,
      times: [{ time: newTime, quantity: 1 }],
    })
    const snapshot = await f.operations.snapshot()
    assert.deepEqual(
      snapshot.schedules.map((s) => s.id),
      [editedId],
    )
    assert.deepEqual(
      todays(snapshot).map((d) => d.dueAt),
      expected,
    )
    if (expected.length === 0) assert.equal(snapshot.today.next?.dueAt, '2026-11-04T06:00:00.000Z')
  }
})

test('Schedule versions retain early Taken outcomes, prior History and earlier-version recording and corrections', async () => {
  const f = await versionFixture()
  const id = randomUUID()
  await f.operations.save({
    id,
    medicineId: f.medicineId,
    startDate: '2026-11-02',
    times: [{ time: '10:00', quantity: 1 }],
  })
  f.setNow('2026-11-03T05:30:00.000Z')
  const past = await f.operations.history('2026-11-02')
  const dueAt = '2026-11-03T07:00:00.000Z'
  await f.operations.recordTaken({
    scheduleId: id,
    dueAt,
    takenAt: '2026-11-03T05:30:00.000Z',
    quantity: 1,
  })
  f.setNow('2026-11-03T06:00:00.000Z')
  await f.operations.edit({
    id: randomUUID(),
    basedOnId: id,
    endDate: null,
    times: [{ time: '11:00', quantity: 1 }],
  })
  assert.deepEqual(
    todays(await f.operations.snapshot()).map((d) => [d.dueAt, d.status]),
    [
      [dueAt, 'Taken'],
      ['2026-11-03T08:00:00.000Z', 'Upcoming'],
    ],
  )
  assert.deepEqual(await f.operations.history('2026-11-02'), past)
  await f.operations.correctOutcome({
    scheduleId: id,
    dueAt,
    actionId: randomUUID(),
    expectedRevision: 0,
    expectedOutcome: 'Taken',
    outcome: 'Skipped',
  })
  assert.equal(todays(await f.operations.snapshot())[0].status, 'Skipped')
  await f.operations.recordSkipped({ scheduleId: id, dueAt: '2026-11-02T07:00:00.000Z' })
  assert.equal((await f.operations.history('2026-11-02'))[0].status, 'Skipped')
  f.setNow('2026-11-04T09:00:00.000Z')
  await assert.rejects(
    () => f.operations.recordSkipped({ scheduleId: id, dueAt: '2026-11-04T07:00:00.000Z' }),
    /validation/,
  )
})

test('Schedule versions switch Clock and Interval and preserve an Interval Anchor when hours change', async () => {
  const f = await versionFixture()
  const clockId = randomUUID()
  await f.operations.save({
    id: clockId,
    medicineId: f.medicineId,
    startDate: '2026-11-02',
    times: [{ time: '08:00', quantity: 1 }],
  })
  f.setNow('2026-11-03T06:00:00.000Z')
  const past = await f.operations.history('2026-11-02')
  await f.operations.recordSkipped({ scheduleId: clockId, dueAt: '2026-11-03T05:00:00.000Z' })
  const intervalId = randomUUID()
  const switchInput = {
    id: intervalId,
    basedOnId: clockId,
    endDate: null,
    intervalHours: 8,
    times: [{ time: '08:00', quantity: 1 }],
  }
  await assert.rejects(() => f.operations.edit(switchInput), /validation/)
  await f.operations.edit({ ...switchInput, anchorDate: '2026-11-03' })
  assert.deepEqual(
    todays(await f.operations.snapshot()).map((d) => [d.dueAt, d.status]),
    [
      ['2026-11-03T05:00:00.000Z', 'Skipped'],
      ['2026-11-03T13:00:00.000Z', 'Upcoming'],
    ],
  )
  f.setNow('2026-11-03T10:00:00.000Z')
  const hoursId = randomUUID()
  const [hours] = await f.operations.edit({
    id: hoursId,
    basedOnId: intervalId,
    endDate: null,
    intervalHours: 6,
    times: [{ time: '08:00', quantity: 1 }],
  })
  assert.equal(hours.startDate, '2026-11-03')
  assert.equal((await f.operations.snapshot()).today.next?.dueAt, '2026-11-03T11:00:00.000Z')
  await f.operations.recordTaken({
    scheduleId: hoursId,
    dueAt: '2026-11-03T11:00:00.000Z',
    takenAt: '2026-11-03T10:00:00.000Z',
    quantity: 1,
  })
  f.setNow('2026-11-03T11:00:00.000Z')
  await f.operations.edit({
    id: randomUUID(),
    basedOnId: hoursId,
    endDate: null,
    times: [{ time: '15:00', quantity: 2 }],
  })
  assert.deepEqual(
    todays(await f.operations.snapshot()).map((d) => [d.dueAt, d.status]),
    [
      ['2026-11-03T05:00:00.000Z', 'Skipped'],
      ['2026-11-03T11:00:00.000Z', 'Taken'],
      ['2026-11-03T12:00:00.000Z', 'Upcoming'],
    ],
  )
  assert.deepEqual(await f.operations.history('2026-11-02'), past)
})

test('Schedule version edits reject stale or changed attempts and other owners; retries retain Edit time', async () => {
  const f = await versionFixture()
  const id = randomUUID()
  await f.operations.save({
    id,
    medicineId: f.medicineId,
    startDate: '2026-11-02',
    times: [{ time: '09:00', quantity: 1 }],
  })
  f.setNow('2026-11-03T06:00:00.000Z')
  const edit = {
    id: randomUUID(),
    basedOnId: id,
    endDate: null,
    times: [{ time: '10:00', quantity: 1 }],
  }
  const outsider = createScheduleOperations({
    requireUser: async () => ({ id: 'google:outsider' }),
    send: f.send,
  })
  await assert.rejects(() => outsider.edit(edit), { status: 400 })
  const anonymous = createScheduleOperations({
    requireUser: async () => {
      throw new Error('unauthorized')
    },
    send: f.send,
  })
  await assert.rejects(() => anonymous.edit(edit), /unauthorized/)
  const saved = await f.operations.edit(edit)
  f.setNow('2026-11-04T06:00:00.000Z')
  assert.deepEqual(await f.operations.edit(edit), saved)
  await assert.rejects(
    () => f.operations.edit({ ...edit, times: [{ time: '11:00', quantity: 1 }] }),
    { status: 409 },
  )
  await assert.rejects(() => f.operations.edit({ ...edit, id: randomUUID() }), { status: 409 })
  for (const extra of [{ startDate: '2026-11-05' }, { medicineId: f.medicineId }])
    await assert.rejects(() => f.operations.edit({ ...edit, ...extra }), /validation/)
  const next = {
    id: randomUUID(),
    basedOnId: edit.id,
    endDate: null,
    times: [{ time: '12:00', quantity: 1 }],
  }
  const races = await Promise.allSettled([
    f.operations.edit(next),
    f.operations.edit({ ...next, id: randomUUID() }),
  ])
  assert.equal(races.filter((r) => r.status === 'fulfilled').length, 1)
  const rejected = races.find((r) => r.status === 'rejected') as PromiseRejectedResult
  assert.equal(rejected.reason.status, 409)
  const [replayed] = await f.operations.edit(edit)
  assert.equal(replayed.confirmedAt, saved[0].confirmedAt)
  assert.equal((await f.operations.snapshot()).schedules.length, 1)
})

test('Schedule version migration preserves pre-existing Skipped outcomes and correction revisions', async () => {
  const response = await runtime.dispatchFetch('http://worker/schedules', {
    method: 'POST',
    headers: { authorization: `Bearer ${secret}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      operation: 'listOutcomes',
      ownerId: legacy.ownerId,
      date: '2026-11-06',
    }),
  })
  assert.equal(response.status, 200)
  const snapshot = (await response.json()) as ScheduleResponse<
    Extract<ScheduleCommand, { operation: 'listOutcomes' }>
  >
  assert.equal(snapshot.schedules[0].id, legacy.scheduleId)
  assert.deepEqual(
    snapshot.records.map((r) => [r.scheduleId, r.dueAt, r.outcome, r.revision, r.actionId]),
    [
      [
        legacy.scheduleId,
        '2026-11-06T06:00:00.000Z',
        'Taken',
        1,
        '10000000-0000-4000-8000-000000000003',
      ],
    ],
  )
})

test('an early recording racing an edit is either retained or rejected without restoring a replaced dose', async () => {
  const f = await versionFixture()
  const id = randomUUID()
  await f.operations.save({
    id,
    medicineId: f.medicineId,
    startDate: '2026-11-02',
    times: [{ time: '10:00', quantity: 1 }],
  })
  f.setNow('2026-11-03T06:00:00.000Z')
  const [recorded, edited] = await Promise.allSettled([
    f.operations.recordSkipped({ scheduleId: id, dueAt: '2026-11-03T07:00:00.000Z' }),
    f.operations.edit({
      id: randomUUID(),
      basedOnId: id,
      endDate: null,
      times: [{ time: '11:00', quantity: 1 }],
    }),
  ])
  assert.equal(edited.status, 'fulfilled')
  const doses = todays(await f.operations.snapshot())
  assert.equal(
    doses.some((d) => d.scheduleId === id),
    recorded.status === 'fulfilled',
  )
  if (recorded.status === 'rejected') assert.ok([400, 409].includes(recorded.reason.status))
  else assert.equal(doses[0].status, 'Skipped')
})

test('Last day today keeps earlier doses and includes the final evening only', async () => {
  const f = await versionFixture()
  const id = randomUUID()
  const times = [
    { time: '09:00', quantity: 1 },
    { time: '21:00', quantity: 1 },
  ]
  await f.operations.save({ id, medicineId: f.medicineId, startDate: '2026-11-02', times })
  f.setNow('2026-11-03T07:00:00.000Z')
  const edit = { id: randomUUID(), basedOnId: id, times, endDate: '2026-11-03' }
  await assert.rejects(() => f.operations.edit({ ...edit, endDate: '2026-11-02' }), /validation/)
  const [saved] = await f.operations.edit(edit)
  assert.equal(saved.endDate, '2026-11-03')
  assert.deepEqual(
    todays(await f.operations.snapshot()).map((d) => [d.scheduleId, d.dueAt]),
    [
      [id, '2026-11-03T06:00:00.000Z'],
      [edit.id, '2026-11-03T18:00:00.000Z'],
    ],
  )
  f.setNow('2026-11-04T07:00:00.000Z')
  const snapshot = await f.operations.snapshot()
  assert.deepEqual(todays(snapshot), [])
  assert.equal(snapshot.today.next, null)
  assert.equal((await f.operations.history('2026-11-03')).length, 2)
  const key = { scheduleId: id, dueAt: '2026-11-03T06:00:00.000Z' }
  await f.operations.recordSkipped(key)
  await f.operations.correctOutcome({
    ...key,
    actionId: randomUUID(),
    expectedRevision: 0,
    expectedOutcome: 'Skipped',
    outcome: 'Taken',
    takenAt: '2026-11-04T07:00:00.000Z',
    quantity: 1,
  })
  assert.equal((await f.operations.history('2026-11-03'))[0].status, 'Taken')
})

test('Last day changes require an explicit valid day and retain the day sent with a time change', async () => {
  const f = await versionFixture()
  const id = randomUUID()
  const input = {
    id,
    medicineId: f.medicineId,
    startDate: '2026-11-05',
    times: [{ time: '09:00', quantity: 1 }],
    intervalHours: 8,
    endDate: '2026-11-06',
  }
  for (const intervalHours of [null, 8])
    await assert.rejects(
      () => f.operations.save({ ...input, intervalHours, endDate: '2026-11-04' }),
      /validation/,
    )
  const saved = await f.operations.save(input)
  f.setNow('2026-11-03T07:00:00.000Z')
  const edit = {
    id: randomUUID(),
    basedOnId: id,
    times: input.times,
    intervalHours: 6,
    endDate: '2026-11-06',
  }
  for (const endDate of [undefined, '', '2026-02-30', '2026-11-02', '2026-11-04']) {
    await assert.rejects(() => f.operations.edit({ ...edit, endDate }), /validation/)
  }
  await assert.rejects(() => f.operations.edit({ ...edit, anchorDate: '2026-11-07' }), /validation/)
  const [changed] = await f.operations.edit(edit)
  assert.equal(changed.endDate, '2026-11-06')
  assert.equal(changed.startDate, '2026-11-05')
  f.setNow('2026-11-08T07:00:00.000Z')
  assert.deepEqual(await f.operations.save(input), [
    { ...saved[0], replacedAt: '2026-11-03T07:00:00.000Z' },
  ])
  assert.deepEqual(await f.operations.edit(edit), [changed])
  await assert.rejects(() => f.operations.edit({ ...edit, endDate: null }), { status: 409 })
  await assert.rejects(() => f.operations.edit({ ...edit, id: randomUUID(), endDate: null }), {
    status: 409,
  })
  const outsider = createScheduleOperations({
    requireUser: async () => ({ id: 'google:outsider' }),
    send: f.send,
  })
  await assert.rejects(
    () => outsider.edit({ ...edit, id: randomUUID(), basedOnId: changed.id, endDate: null }),
    { status: 400 },
  )
})

test('Ended schedules restart after the Edit time without restoring doses in the gap', async () => {
  for (const intervalHours of [null, 12]) {
    for (const endDate of ['2026-11-06', null]) {
      const f = await versionFixture()
      const id = randomUUID()
      const times = intervalHours
        ? [{ time: '09:00', quantity: 1 }]
        : [
            { time: '09:00', quantity: 1 },
            { time: '21:00', quantity: 1 },
          ]
      await f.operations.save({
        id,
        medicineId: f.medicineId,
        startDate: '2026-11-02',
        times,
        intervalHours,
        endDate: '2026-11-03',
      })
      f.setNow('2026-11-05T07:00:00.000Z')
      assert.equal((await f.operations.snapshot()).today.next, null)
      const past = await f.operations.history('2026-11-03')
      const edit = { id: randomUUID(), basedOnId: id, times, intervalHours, endDate }
      await f.operations.edit(edit)
      assert.deepEqual(
        todays(await f.operations.snapshot()).map((d) => [d.scheduleId, d.dueAt]),
        [[edit.id, '2026-11-05T18:00:00.000Z']],
      )
      assert.deepEqual(await f.operations.history('2026-11-04'), [])
      assert.deepEqual(await f.operations.history('2026-11-05'), [])
      assert.deepEqual(await f.operations.history('2026-11-03'), past)
    }
  }
})

test('Final day and End preserves history keep the 23:30 dose recordable and correctable', async () => {
  const f = await versionFixture()
  const id = randomUUID()
  await f.operations.save({
    id,
    medicineId: f.medicineId,
    startDate: '2026-11-02',
    times: [{ time: '23:30', quantity: 1 }],
    endDate: '2026-11-03',
  })
  f.setNow('2026-11-03T20:00:00.000Z')
  assert.equal((await f.operations.snapshot()).today.next?.dueAt, '2026-11-03T20:30:00.000Z')
  f.setNow('2026-11-04T07:00:00.000Z')
  assert.equal((await f.operations.snapshot()).today.next, null)
  assert.deepEqual(
    (await f.operations.history('2026-11-03')).map((d) => [d.dueAt, d.status]),
    [['2026-11-03T20:30:00.000Z', 'Not logged']],
  )
  assert.deepEqual(await f.operations.history('2026-11-04'), [])
  const key = { scheduleId: id, dueAt: '2026-11-03T20:30:00.000Z' }
  await f.operations.recordSkipped(key)
  await f.operations.correctOutcome({
    ...key,
    actionId: randomUUID(),
    expectedRevision: 0,
    expectedOutcome: 'Skipped',
    outcome: 'Taken',
    takenAt: '2026-11-04T07:00:00.000Z',
    quantity: 1,
  })
  assert.equal((await f.operations.history('2026-11-03'))[0].status, 'Taken')
})
