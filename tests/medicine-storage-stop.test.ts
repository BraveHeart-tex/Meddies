import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'vitest'
import { createScheduleOperations } from '../src/features/schedules/operations'
import { startWorkerRuntime, versionFixture } from './helpers/medicine-storage-runtime'

// Stop on real D1.
startWorkerRuntime()

test('Stop now preserves the morning dose and reads the stop day without future doses', async () => {
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
  const [stopped] = await f.operations.stop({ id: randomUUID(), basedOnId: id })
  assert.equal(stopped.stoppedAt, '2026-11-03T11:00:00.000Z')
  const snapshot = await f.operations.snapshot()
  assert.equal(snapshot.schedules[0].stoppedAt, stopped.stoppedAt)
  assert.deepEqual(
    snapshot.today.doses.map((d) => [d.dueAt, d.status]),
    [['2026-11-03T05:00:00.000Z', 'Not logged']],
  )
  assert.equal(snapshot.today.next, null)
  await f.operations.recordSkipped({ scheduleId: id, dueAt: '2026-11-03T05:00:00.000Z' })
  f.setNow('2026-11-04T07:00:00.000Z')
  assert.deepEqual((await f.operations.snapshot()).today.doses, [])
  assert.equal((await f.operations.history('2026-11-03'))[0].status, 'Skipped')
})

test('Stop keeps an early record, including correction after the stop', async () => {
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
  f.setNow('2026-11-03T10:30:00.000Z')
  const key = { scheduleId: id, dueAt: '2026-11-03T17:00:00.000Z' }
  await f.operations.recordTaken({ ...key, takenAt: '2026-11-03T10:30:00.000Z', quantity: 1 })
  f.setNow('2026-11-03T11:00:00.000Z')
  await f.operations.stop({ id: randomUUID(), basedOnId: id })
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
  f.setNow('2026-11-04T07:00:00.000Z')
  assert.equal((await f.operations.history('2026-11-03'))[1].status, 'Skipped')
})

test('Stop before start expects no doses, and stops allow a later Last day', async () => {
  const f = await versionFixture()
  const id = randomUUID()
  await f.operations.save({
    id,
    medicineId: f.medicineId,
    startDate: '2026-11-05',
    endDate: '2026-11-08',
    times: [{ time: '08:00', quantity: 1 }],
  })
  f.setNow('2026-11-03T11:00:00.000Z')
  await f.operations.stop({ id: randomUUID(), basedOnId: id })
  assert.equal((await f.operations.snapshot()).today.next, null)
  f.setNow('2026-11-06T11:00:00.000Z')
  assert.deepEqual(await f.operations.history('2026-11-05'), [])
})

test('Restart after stop never restores doses in the gap, with or without a Last day', async () => {
  for (const endDate of [null, '2026-11-06']) {
    const f = await versionFixture()
    const id = randomUUID()
    const times = [
      { time: '08:00', quantity: 1 },
      { time: '20:00', quantity: 1 },
    ]
    await f.operations.save({ id, medicineId: f.medicineId, startDate: '2026-11-02', times })
    f.setNow('2026-11-03T11:00:00.000Z')
    const [stop] = await f.operations.stop({ id: randomUUID(), basedOnId: id })
    assert.equal(stop.endDate, null)
    f.setNow('2026-11-04T07:00:00.000Z')
    const edit = { id: randomUUID(), basedOnId: stop.id, times, endDate }
    await assert.rejects(() => f.operations.edit({ ...edit, endDate: '2026-11-03' }), {
      status: 400,
    })
    const [restart] = await f.operations.edit(edit)
    assert.equal(restart.stoppedAt, null)
    assert.deepEqual(
      (await f.operations.history('2026-11-03')).map((d) => d.dueAt),
      ['2026-11-03T05:00:00.000Z'],
    )
    assert.deepEqual(
      (await f.operations.snapshot()).today.doses.map((d) => d.dueAt),
      ['2026-11-04T17:00:00.000Z'],
    )
    f.setNow('2026-11-07T20:00:00.000Z')
    assert.deepEqual(
      (await f.operations.history('2026-11-06')).map((d) => d.dueAt),
      ['2026-11-06T05:00:00.000Z', '2026-11-06T17:00:00.000Z'],
    )
    assert.equal((await f.operations.history('2026-11-07')).length, endDate ? 0 : 2)
  }
})

test('Stops reject Ended schedules, stale attempts, changed retries and other owners', async () => {
  const f = await versionFixture()
  const id = randomUUID()
  await f.operations.save({
    id,
    medicineId: f.medicineId,
    startDate: '2026-11-02',
    times: [{ time: '08:00', quantity: 1 }],
  })
  f.setNow('2026-11-03T11:00:00.000Z')
  const stop = { id: randomUUID(), basedOnId: id }
  const outsider = createScheduleOperations({
    requireUser: async () => ({ id: 'google:outsider' }),
    send: f.send,
  })
  await assert.rejects(() => outsider.stop(stop), { status: 400 })
  const saved = await f.operations.stop(stop)
  f.setNow('2026-11-04T07:00:00.000Z')
  assert.deepEqual(await f.operations.stop(stop), saved)
  await assert.rejects(() => f.operations.stop({ ...stop, id: randomUUID() }), { status: 409 })
  await assert.rejects(() => f.operations.stop({ id: randomUUID(), basedOnId: stop.id }), {
    status: 400,
  })
  await assert.rejects(() => f.operations.stop({ ...stop, basedOnId: randomUUID() }), {
    status: 409,
  })
  const g = await versionFixture()
  const ended = randomUUID()
  await g.operations.save({
    id: ended,
    medicineId: g.medicineId,
    startDate: '2026-11-02',
    endDate: '2026-11-02',
    times: [{ time: '08:00', quantity: 1 }],
  })
  g.setNow('2026-11-03T11:00:00.000Z')
  await assert.rejects(() => g.operations.stop({ id: randomUUID(), basedOnId: ended }), {
    status: 400,
  })
})

test('Clock and Interval stops keep doses at the Edit time recordable and correctable in Today and History', async () => {
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
    await f.operations.stop({ id: randomUUID(), basedOnId: id })
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

test('a stop racing a schedule change appends exactly one successor', async () => {
  const f = await versionFixture()
  const id = randomUUID()
  const times = [{ time: '08:00', quantity: 1 }]
  await f.operations.save({ id, medicineId: f.medicineId, startDate: '2026-11-02', times })
  f.setNow('2026-11-03T11:00:00.000Z')
  const results = await Promise.allSettled([
    f.operations.stop({ id: randomUUID(), basedOnId: id }),
    f.operations.edit({ id: randomUUID(), basedOnId: id, times, endDate: null }),
  ])
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1)
  const rejected = results.find((result) => result.status === 'rejected') as PromiseRejectedResult
  assert.equal(rejected.reason.status, 409)
  const snapshot = await f.operations.snapshot()
  assert.equal(snapshot.schedules.length, 1)
  assert.equal(snapshot.earlierSchedules.length, 1)
})
