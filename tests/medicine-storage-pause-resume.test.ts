import assert from 'node:assert/strict'
import { endedOn, pausedOn } from '../src/features/schedules/last-day'
import { randomUUID } from 'node:crypto'
import { test } from 'vitest'
import { createScheduleOperations } from '../src/features/schedules/operations'
import { startWorkerRuntime, versionFixture } from './helpers/medicine-storage-runtime'

// Pause and resume on real D1.
startWorkerRuntime()

test('Pause now keeps the morning dose loggable without future doses', async () => {
  const f = await versionFixture()
  const id = randomUUID()
  await f.operations.save({
    id,
    medicineId: f.medicineId,
    startDate: '2026-11-02',
    times: [
      { time: '08:00', quantity: 1 },
      { time: '20:00', quantity: 1 },
    ],
  })
  f.setNow('2026-11-03T11:00:00.000Z')
  const [paused] = await f.operations.pause({ id: randomUUID(), basedOnId: id })
  assert.equal(paused.pausedAt, '2026-11-03T11:00:00.000Z')
  const snapshot = await f.operations.snapshot()
  assert.equal(snapshot.schedules[0].pausedAt, paused.pausedAt)
  assert.equal(pausedOn(snapshot.schedules[0], '2026-11-03'), '2026-11-03')
  assert.deepEqual(
    snapshot.today.doses.map((d) => [d.dueAt, d.status]),
    [['2026-11-03T05:00:00.000Z', 'Not logged']],
  )
  assert.equal(snapshot.today.next, null)
  await f.operations.recordSkipped({ scheduleId: id, dueAt: '2026-11-03T05:00:00.000Z' })
  f.setNow('2026-11-04T07:00:00.000Z')
  assert.deepEqual((await f.operations.snapshot()).today.doses, [])
  assert.deepEqual(await f.operations.history('2026-11-04'), [])
  assert.equal((await f.operations.history('2026-11-03'))[0].status, 'Skipped')
})

test('Pause keeps an early record and adds no paused-day doses for Clock and Interval schedules', async () => {
  for (const intervalHours of [null, 12]) {
    const f = await versionFixture()
    const id = randomUUID()
    await f.operations.save({
      id,
      medicineId: f.medicineId,
      startDate: '2026-11-02',
      intervalHours,
      times: intervalHours
        ? [{ time: '08:00', quantity: 1 }]
        : [
            { time: '08:00', quantity: 1 },
            { time: '20:00', quantity: 1 },
          ],
    })
    f.setNow('2026-11-03T10:30:00.000Z')
    const key = { scheduleId: id, dueAt: '2026-11-03T17:00:00.000Z' }
    await f.operations.recordTaken({ ...key, takenAt: '2026-11-03T10:30:00.000Z', quantity: 1 })
    f.setNow('2026-11-03T11:00:00.000Z')
    await f.operations.pause({ id: randomUUID(), basedOnId: id })
    assert.deepEqual(
      (await f.operations.snapshot()).today.doses.map((d) => [d.dueAt, d.status]),
      [
        ['2026-11-03T05:00:00.000Z', 'Not logged'],
        [key.dueAt, 'Taken'],
      ],
    )
    await f.operations.correctOutcome({
      ...key,
      actionId: randomUUID(),
      expectedRevision: 0,
      expectedOutcome: 'Taken',
      outcome: 'Skipped',
    })
    f.setNow('2026-11-05T07:00:00.000Z')
    assert.deepEqual((await f.operations.snapshot()).today.doses, [])
    assert.equal((await f.operations.snapshot()).today.next, null)
    assert.deepEqual(await f.operations.history('2026-11-04'), [])
    assert.deepEqual(
      (await f.operations.history('2026-11-03')).map((d) => d.status),
      ['Not logged', 'Skipped'],
    )
    await assert.rejects(
      () => f.operations.recordSkipped({ scheduleId: id, dueAt: '2026-11-04T05:00:00.000Z' }),
      { status: 400 },
    )
  }
})

test('Last day while paused reads as Ended, while Stop uses its own day', async () => {
  for (const stop of [false, true]) {
    const f = await versionFixture()
    const id = randomUUID()
    await f.operations.save({
      id,
      medicineId: f.medicineId,
      startDate: '2026-11-02',
      endDate: '2026-11-10',
      times: [{ time: '08:00', quantity: 1 }],
    })
    f.setNow('2026-11-04T21:30:00.000Z') // Nov 5 in Istanbul.
    const [paused] = await f.operations.pause({ id: randomUUID(), basedOnId: id })
    assert.equal(pausedOn(paused, '2026-11-05'), '2026-11-05')
    assert.equal(endedOn(paused, '2026-11-10'), null)
    assert.equal(pausedOn(paused, '2026-11-10'), '2026-11-05')
    if (stop) {
      f.setNow('2026-11-07T07:00:00.000Z')
      await f.operations.stop({ id: randomUUID(), basedOnId: paused.id })
    }
    f.setNow('2026-11-11T07:00:00.000Z')
    const current = (await f.operations.snapshot()).schedules[0]
    assert.equal(endedOn(current, '2026-11-11'), stop ? '2026-11-07' : '2026-11-10')
    assert.equal(pausedOn(current, '2026-11-11'), null)
    assert.equal((await f.operations.snapshot()).today.next, null)
    await assert.rejects(() => f.operations.pause({ id: randomUUID(), basedOnId: current.id }), {
      status: 400,
    })
  }
})

test('Pause rejects invalid states, stale writes, changed retries and other owners', async () => {
  const f = await versionFixture()
  const id = randomUUID()
  await f.operations.save({
    id,
    medicineId: f.medicineId,
    startDate: '2026-11-05',
    endDate: '2026-11-10',
    times: [{ time: '08:00', quantity: 1 }],
  })
  f.setNow('2026-11-03T11:00:00.000Z')
  const pause = { id: randomUUID(), basedOnId: id }
  const outsider = createScheduleOperations({
    requireUser: async () => ({ id: 'google:outsider' }),
    send: f.send,
  })
  await assert.rejects(() => outsider.pause(pause), { status: 400 })
  const saved = await f.operations.pause(pause)
  assert.equal(saved[0].startDate, '2026-11-05')
  assert.equal(saved[0].endDate, '2026-11-10')
  assert.equal((await f.operations.snapshot()).today.next, null)
  f.setNow('2026-11-04T07:00:00.000Z')
  assert.deepEqual(await f.operations.pause(pause), saved)
  await assert.rejects(() => f.operations.pause({ ...pause, id: randomUUID() }), { status: 409 })
  await assert.rejects(() => f.operations.pause({ ...pause, basedOnId: randomUUID() }), {
    status: 409,
  })
  await assert.rejects(() => f.operations.stop(pause), { status: 409 })
  await assert.rejects(() => f.operations.pause({ id: randomUUID(), basedOnId: pause.id }), {
    status: 400,
  })
  await assert.rejects(
    () =>
      f.operations.edit({
        id: randomUUID(),
        basedOnId: pause.id,
        times: [{ time: '09:00', quantity: 1 }],
        endDate: null,
      }),
    { status: 400 },
  )
  await f.operations.stop({ id: randomUUID(), basedOnId: pause.id })
  const current = (await f.operations.snapshot()).schedules[0]
  assert.equal(endedOn(current, '2026-11-04'), '2026-11-04')
  await assert.rejects(() => f.operations.pause({ id: randomUUID(), basedOnId: current.id }), {
    status: 400,
  })
})

test('Clock and Interval pauses keep doses at the Edit time recordable and correctable in Today and History', async () => {
  for (const intervalHours of [null, 6]) {
    const f = await versionFixture()
    const id = randomUUID()
    await f.operations.save({
      id,
      medicineId: f.medicineId,
      startDate: '2026-11-02',
      intervalHours,
      times: intervalHours
        ? [{ time: '08:00', quantity: 1 }]
        : [
            { time: '08:00', quantity: 1 },
            { time: '14:00', quantity: 1 },
            { time: '20:00', quantity: 1 },
          ],
    })
    f.setNow('2026-11-03T11:00:00.000Z')
    await f.operations.pause({ id: randomUUID(), basedOnId: id })
    const key = { scheduleId: id, dueAt: '2026-11-03T11:00:00.000Z' }
    assert.ok((await f.operations.snapshot()).today.doses.some((d) => d.dueAt === key.dueAt))
    await f.operations.recordSkipped(key)
    await f.operations.correctOutcome({
      ...key,
      actionId: randomUUID(),
      expectedRevision: 0,
      expectedOutcome: 'Skipped',
      outcome: 'Taken',
      takenAt: key.dueAt,
      quantity: 1,
    })
    assert.equal(
      (await f.operations.snapshot()).today.doses.find((d) => d.dueAt === key.dueAt)?.status,
      'Taken',
    )
    await assert.rejects(
      () => f.operations.recordSkipped({ scheduleId: id, dueAt: '2026-11-03T17:00:00.000Z' }),
      { status: 400 },
    )
    f.setNow('2026-11-04T07:00:00.000Z')
    assert.equal(
      (await f.operations.history('2026-11-03')).find((d) => d.dueAt === key.dueAt)?.status,
      'Taken',
    )
    assert.deepEqual((await f.operations.snapshot()).today.doses, [])
  }
})

test('a pause racing a schedule change appends exactly one successor', async () => {
  const f = await versionFixture()
  const id = randomUUID()
  const times = [{ time: '08:00', quantity: 1 }]
  await f.operations.save({ id, medicineId: f.medicineId, startDate: '2026-11-02', times })
  f.setNow('2026-11-03T11:00:00.000Z')
  const results = await Promise.allSettled([
    f.operations.pause({ id: randomUUID(), basedOnId: id }),
    f.operations.edit({ id: randomUUID(), basedOnId: id, times, endDate: null }),
  ])
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1)
  const rejected = results.find((result) => result.status === 'rejected') as PromiseRejectedResult
  assert.equal(rejected.reason.status, 409)
  const snapshot = await f.operations.snapshot()
  assert.equal(snapshot.schedules.length, 1)
  assert.equal(snapshot.earlierSchedules.length, 1)
})

test('Resume clock keeps the routine and skips paused days', async () => {
  const f = await versionFixture()
  const id = randomUUID()
  await f.operations.save({
    id,
    medicineId: f.medicineId,
    startDate: '2026-11-02',
    times: [
      { time: '08:00', quantity: 1 },
      { time: '20:00', quantity: 2 },
    ],
  })
  f.setNow('2026-11-03T11:00:00.000Z')
  const [paused] = await f.operations.pause({ id: randomUUID(), basedOnId: id })
  f.setNow('2026-11-05T07:00:00.000Z')
  const request = { id: randomUUID(), basedOnId: paused.id }
  const saved = await f.operations.resume(request)
  assert.equal(saved[0].startDate, '2026-11-02')
  assert.deepEqual(saved[0].times, [
    { time: '08:00', quantity: 1 },
    { time: '20:00', quantity: 2 },
  ])
  assert.deepEqual(
    (await f.operations.snapshot()).today.doses.map((d) => [d.dueAt, d.status]),
    [['2026-11-05T17:00:00.000Z', 'Upcoming']],
  )
  assert.deepEqual(await f.operations.history('2026-11-04'), [])
  assert.deepEqual(
    (await f.operations.history('2026-11-03')).map((d) => d.dueAt),
    ['2026-11-03T05:00:00.000Z'],
  )
  assert.deepEqual(await f.operations.resume(request), saved)
  await assert.rejects(() => f.operations.resume({ ...request, id: randomUUID() }), { status: 409 })
})

test('Resume interval requires a new Anchor and preserves its seven-hour routine', async () => {
  const f = await versionFixture()
  const id = randomUUID()
  await f.operations.save({
    id,
    medicineId: f.medicineId,
    startDate: '2026-11-02',
    times: [{ time: '08:00', quantity: 2 }],
    intervalHours: 7,
    endDate: '2026-11-10',
  })
  f.setNow('2026-11-03T07:00:00.000Z')
  const [paused] = await f.operations.pause({ id: randomUUID(), basedOnId: id })
  f.setNow('2026-11-05T07:00:00.000Z')
  const resume = { id: randomUUID(), basedOnId: paused.id }
  await assert.rejects(() => f.operations.resume(resume), { status: 400 })
  await assert.rejects(
    () => f.operations.resume({ ...resume, anchorDate: '2026-11-04', anchorTime: '11:00' }),
    { status: 400 },
  )
  const request = { ...resume, anchorDate: '2026-11-05', anchorTime: '11:00' }
  const [saved] = await f.operations.resume(request)
  assert.equal(saved.startDate, '2026-11-02')
  assert.equal(saved.anchorDate, '2026-11-05')
  assert.equal(saved.endDate, '2026-11-10')
  assert.equal(saved.intervalHours, 7)
  assert.equal(saved.times[0].quantity, 2)
  assert.deepEqual(
    (await f.operations.snapshot()).today.doses.map((d) => d.dueAt),
    ['2026-11-05T08:00:00.000Z', '2026-11-05T15:00:00.000Z'],
  )
  assert.deepEqual(await f.operations.history('2026-11-04'), [])
  f.setNow('2026-11-06T00:00:00.000Z')
  assert.equal((await f.operations.snapshot()).today.doses[0].dueAt, '2026-11-05T22:00:00.000Z')
  assert.deepEqual(await f.operations.resume(request), [saved])
  const [changed] = await f.operations.edit({
    id: randomUUID(),
    basedOnId: saved.id,
    times: saved.times,
    intervalHours: 7,
    endDate: saved.endDate,
  })
  assert.equal(changed.startDate, '2026-11-05')
  assert.equal((await f.operations.snapshot()).today.doses[1].dueAt, '2026-11-06T05:00:00.000Z')
  await assert.rejects(() => f.operations.resume({ ...request, anchorTime: '12:00' }), {
    status: 409,
  })
})

test('Resume before start keeps weekdays, start date and Last day', async () => {
  const f = await versionFixture()
  const id = randomUUID()
  await f.operations.save({
    id,
    medicineId: f.medicineId,
    startDate: '2026-11-05',
    times: [{ time: '08:00', quantity: 1 }],
    weekdays: [4],
    endDate: '2026-11-12',
  })
  f.setNow('2026-11-03T07:00:00.000Z')
  const [paused] = await f.operations.pause({ id: randomUUID(), basedOnId: id })
  f.setNow('2026-11-04T07:00:00.000Z')
  const [saved] = await f.operations.resume({ id: randomUUID(), basedOnId: paused.id })
  assert.equal(saved.startDate, '2026-11-05')
  assert.equal(saved.endDate, '2026-11-12')
  assert.deepEqual(saved.weekdays, [4])
  const snapshot = await f.operations.snapshot()
  assert.deepEqual(snapshot.today.doses, [])
  assert.equal(snapshot.today.next?.dueAt, '2026-11-05T05:00:00.000Z')
})

test('Resume on the Last day is accepted without doses; Ended, stopped and running reject resume', async () => {
  const f = await versionFixture()
  const id = randomUUID()
  await f.operations.save({
    id,
    medicineId: f.medicineId,
    startDate: '2026-11-02',
    times: [{ time: '08:00', quantity: 1 }],
    endDate: '2026-11-03',
  })
  await assert.rejects(() => f.operations.resume({ id: randomUUID(), basedOnId: id }), {
    status: 400,
  })
  const [paused] = await f.operations.pause({ id: randomUUID(), basedOnId: id })
  const outsider = createScheduleOperations({
    requireUser: async () => ({ id: 'google:outsider' }),
    send: f.send,
  })
  await assert.rejects(() => outsider.resume({ id: randomUUID(), basedOnId: paused.id }), {
    status: 400,
  })
  await assert.rejects(
    () =>
      f.operations.resume({
        id: randomUUID(),
        basedOnId: paused.id,
        anchorDate: '2026-11-03',
        anchorTime: '11:00',
      }),
    { status: 400 },
  )
  f.setNow('2026-11-03T07:00:00.000Z')
  const [saved] = await f.operations.resume({ id: randomUUID(), basedOnId: paused.id })
  assert.equal(saved.endDate, '2026-11-03')
  assert.deepEqual((await f.operations.snapshot()).today.doses, [])
  assert.equal((await f.operations.snapshot()).today.next, null)
  f.setNow('2026-11-04T07:00:00.000Z')
  assert.equal(endedOn(saved, '2026-11-04'), '2026-11-03')
  await assert.rejects(() => f.operations.resume({ id: randomUUID(), basedOnId: saved.id }), {
    status: 400,
  })
  // A separate paused version reaches its Last day without resuming.
  const g = await versionFixture()
  const other = randomUUID()
  await g.operations.save({
    id: other,
    medicineId: g.medicineId,
    startDate: '2026-11-02',
    times: [{ time: '08:00', quantity: 1 }],
    endDate: '2026-11-03',
  })
  const [held] = await g.operations.pause({ id: randomUUID(), basedOnId: other })
  g.setNow('2026-11-04T07:00:00.000Z')
  await assert.rejects(() => g.operations.resume({ id: randomUUID(), basedOnId: held.id }), {
    status: 400,
  })
  const h = await versionFixture()
  const third = randomUUID()
  await h.operations.save({
    id: third,
    medicineId: h.medicineId,
    startDate: '2026-11-02',
    times: [{ time: '08:00', quantity: 1 }],
  })
  const [stopped] = await h.operations.stop({ id: randomUUID(), basedOnId: third })
  await assert.rejects(() => h.operations.resume({ id: randomUUID(), basedOnId: stopped.id }), {
    status: 400,
  })
})

test('Interval resume Anchor at the Edit time produces only later doses', async () => {
  const f = await versionFixture()
  const id = randomUUID()
  await f.operations.save({
    id,
    medicineId: f.medicineId,
    startDate: '2026-11-02',
    times: [{ time: '08:00', quantity: 1 }],
    intervalHours: 7,
  })
  const [paused] = await f.operations.pause({ id: randomUUID(), basedOnId: id })
  f.setNow('2026-11-05T08:00:00.000Z')
  await f.operations.resume({
    id: randomUUID(),
    basedOnId: paused.id,
    anchorDate: '2026-11-05',
    anchorTime: '11:00',
  })
  assert.deepEqual(
    (await f.operations.snapshot()).today.doses.map((d) => d.dueAt),
    ['2026-11-05T15:00:00.000Z'],
  )
})
