import assert from 'node:assert/strict'
import { endedOn, pausedOn } from '../src/features/schedules/last-day'
import { randomUUID } from 'node:crypto'
import { sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { test } from 'vitest'
import { saveDeviceRegistration } from '../worker/device-registrations'
import { createWorker } from '../worker/index'
import { snoozeDose } from '../worker/snoozes'
import type { MedicineRecord } from '../src/features/medicines/contract'
import { createScheduleOperations } from '../src/features/schedules/operations'
import {
  call,
  readLowStockEpisode,
  runtime,
  secret,
  startWorkerRuntime,
  versionFixture,
} from './helpers/medicine-storage-runtime'

// Pause and resume on real D1.
startWorkerRuntime()

test('Pause and Resume preserve the episode while Archive forfeits its push budget', async () => {
  const f = await versionFixture()
  const id = randomUUID()
  const { ownerId, medicineId } = f
  const send = async (command: object) => {
    const response = await call({ ownerId, ...command })
    assert.equal(response.status, 200, response.ok ? undefined : await response.text())
    return (await response.json()) as { medicines: MedicineRecord[] }
  }
  const read = async () => (await send({ operation: 'list' })).medicines[0]
  const key = async () => ({
    actionId: randomUUID(),
    medicineId,
    expectedRevision: (await read()).revision,
  })
  const episode = () => readLowStockEpisode(ownerId, medicineId)
  await f.operations.save({
    id,
    medicineId,
    startDate: '2026-11-02',
    times: [{ time: '08:00', quantity: 1 }],
  })
  await send({
    operation: 'stockOn',
    stock: { ...(await key()), unit: 'tablet', startingCount: 4 },
  })
  await send({
    operation: 'stockThreshold',
    stock: { ...(await key()), unit: 'tablet', threshold: 5 },
  })
  const low = await episode()
  assert.equal(low?.pushEligible, 1)

  f.setNow('2026-11-03T11:00:00.000Z')
  const [paused] = await f.operations.pause({ id: randomUUID(), basedOnId: id })
  assert.deepEqual(await episode(), low)
  f.setNow('2026-11-05T07:00:00.000Z')
  await f.operations.resume({ id: randomUUID(), basedOnId: paused.id })
  assert.deepEqual(await episode(), low)

  await send({ operation: 'archive', archive: await key() })
  assert.deepEqual((await read()).stock, { tracked: true, count: 4, threshold: 5 })
  assert.deepEqual(await episode(), { id: low.id, pushEligible: 0 })
  await send({ operation: 'restore', restore: await key() })
  assert.deepEqual((await read()).stock, { tracked: true, count: 4, threshold: 5, low: true })
  assert.deepEqual(await episode(), { id: low.id, pushEligible: 0 })
})

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
    [
      // Yesterday's unresolved 20:00 stays in To log for 24 hours (#275).
      ['2026-11-02T17:00:00.000Z', 'Not logged'],
      ['2026-11-03T05:00:00.000Z', 'Not logged'],
    ],
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
        // Yesterday's unresolved 20:00 stays in To log for 24 hours (#275).
        ['2026-11-02T17:00:00.000Z', 'Not logged'],
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
  // Yesterday's unresolved doses lead To log (#275); today's first dose follows them.
  const todayDoses = async () =>
    (await f.operations.snapshot()).today.doses
      .map((d) => d.dueAt)
      .filter((dueAt) => dueAt >= '2026-11-05T21:00:00.000Z')
  assert.equal((await todayDoses())[0], '2026-11-05T22:00:00.000Z')
  assert.deepEqual(await f.operations.resume(request), [saved])
  const [changed] = await f.operations.edit({
    id: randomUUID(),
    basedOnId: saved.id,
    times: saved.times,
    intervalHours: 7,
    endDate: saved.endDate,
  })
  assert.equal(changed.startDate, '2026-11-05')
  assert.equal((await todayDoses())[1], '2026-11-06T05:00:00.000Z')
  await assert.rejects(() => f.operations.resume({ ...request, anchorTime: '12:00' }), {
    status: 409,
  })
})

/** A tracked-stock seven-hour Interval schedule, saved on November 2 at 08:00 Istanbul. */
async function intervalWithStock() {
  const f = await versionFixture()
  const id = randomUUID()
  const { ownerId, medicineId } = f
  const d1 = await runtime.getD1Database('DB')
  const db = drizzle(d1)
  // In-process at save time: `call` uses the real clock, which would start Stock after the doses.
  const worker = createWorker(() => new Date('2026-11-02T04:00:00.000Z'))
  const send = async (command: object) => {
    const response = await worker.fetch(
      new Request('http://worker/medicines', {
        method: 'POST',
        headers: { authorization: `Bearer ${secret}` },
        body: JSON.stringify({ ownerId, ...command }),
      }),
      { DB: d1, MEDICINES_WORKER_SECRET: secret },
    )
    assert.equal(response.status, 200, response.ok ? undefined : await response.text())
    return (await response.json()) as { medicines: MedicineRecord[] }
  }
  const read = async () => (await send({ operation: 'list' })).medicines[0]
  await f.operations.save({
    id,
    medicineId,
    startDate: '2026-11-02',
    times: [{ time: '08:00', quantity: 2 }],
    intervalHours: 7,
  })
  await send({
    operation: 'stockOn',
    stock: {
      actionId: randomUUID(),
      medicineId,
      expectedRevision: (await read()).revision,
      unit: 'tablet',
      startingCount: 20,
    },
  })
  const count = async () => {
    const stock = (await read()).stock
    return stock?.tracked ? stock.count : null
  }
  const written = async () =>
    db.all<{ table: string; n: number }>(sql`
      SELECT 'taken' AS "table", COUNT(*) AS n FROM dose_records WHERE owner_id = ${ownerId}
      UNION ALL SELECT 'skipped', COUNT(*) FROM skipped_dose_records WHERE owner_id = ${ownerId}
      UNION ALL SELECT 'snoozes', COUNT(*) FROM snoozes WHERE owner_id = ${ownerId}
      UNION ALL SELECT 'movements', COUNT(*) FROM intake_stock_movements WHERE owner_id = ${ownerId}`)
  return { ...f, id, db, count, written }
}

test('A resumed Interval schedule validates outcomes, corrections and Snooze on its Anchor', async () => {
  const f = await intervalWithStock()
  f.setNow('2026-11-03T07:00:00.000Z')
  const [paused] = await f.operations.pause({ id: randomUUID(), basedOnId: f.id })
  f.setNow('2026-11-05T07:00:00.000Z')
  const [resumed] = await f.operations.resume({
    id: randomUUID(),
    basedOnId: paused.id,
    anchorDate: '2026-11-05',
    anchorTime: '11:00',
  })
  assert.equal(resumed.startDate, '2026-11-02')
  await saveDeviceRegistration(
    f.db,
    f.ownerId,
    { installationId: randomUUID(), token: `token-${randomUUID()}` },
    new Date('2026-11-05T07:00:00.000Z'),
  )
  const scheduleId = resumed.id
  const snooze = (dueAt: string, at: string) =>
    snoozeDose(f.db, f.ownerId, { actionId: randomUUID(), scheduleId, dueAt }, new Date(at))
  // Anchor grid: 08:00Z, 15:00Z. 12:00Z sits on the retained start date's grid only.
  const onAnchor = await snooze('2026-11-05T08:00:00.000Z', '2026-11-05T08:10:00.000Z')
  assert.equal(onAnchor.outcome, 'snoozed')

  const offGrid = '2026-11-05T12:00:00.000Z'
  f.setNow('2026-11-05T12:10:00.000Z')
  const afterSnooze = await f.written()
  assert.deepEqual(await snooze(offGrid, '2026-11-05T12:10:00.000Z'), {
    outcome: 'rejected',
    reason: 'notFound',
  })
  await assert.rejects(
    () =>
      f.operations.recordTaken({
        scheduleId,
        dueAt: offGrid,
        takenAt: '2026-11-05T12:05:00.000Z',
        quantity: 2,
      }),
    /validation/,
  )
  await assert.rejects(
    () => f.operations.recordSkipped({ scheduleId, dueAt: offGrid }),
    /validation/,
  )
  assert.deepEqual(await f.written(), afterSnooze)
  assert.equal(await f.count(), 20)

  f.setNow('2026-11-05T15:10:00.000Z')
  const taken = await f.operations.recordTaken({
    scheduleId,
    dueAt: '2026-11-05T08:00:00.000Z',
    takenAt: '2026-11-05T08:30:00.000Z',
    quantity: 2,
  })
  assert.equal(taken.outcome, 'Taken')
  assert.equal(await f.count(), 18)
  const skipped = await f.operations.recordSkipped({
    scheduleId,
    dueAt: '2026-11-05T15:00:00.000Z',
  })
  assert.equal(skipped.outcome, 'Skipped')
  const corrected = await f.operations.correctOutcome({
    scheduleId,
    dueAt: '2026-11-05T15:00:00.000Z',
    actionId: randomUUID(),
    expectedRevision: 0,
    expectedOutcome: 'Skipped',
    outcome: 'Taken',
    takenAt: '2026-11-05T15:05:00.000Z',
    quantity: 2,
  })
  assert.equal(corrected.outcome, 'Taken')
  assert.equal(await f.count(), 16)
  assert.deepEqual(
    (await f.operations.history('2026-11-05')).map((d) => [d.dueAt, d.status]),
    [
      ['2026-11-05T08:00:00.000Z', 'Taken'],
      ['2026-11-05T15:00:00.000Z', 'Taken'],
    ],
  )
})

test('A legacy Interval schedule with no Anchor date keeps its start-date Occurrences', async () => {
  const f = await intervalWithStock()
  const [row] = await f.db.all<{ anchorDate: string | null }>(
    sql`SELECT anchor_date AS anchorDate FROM daily_schedules WHERE id = ${f.id}`,
  )
  assert.equal(row.anchorDate, null)
  f.setNow('2026-11-02T12:10:00.000Z')
  const before = await f.written()
  await assert.rejects(
    () => f.operations.recordSkipped({ scheduleId: f.id, dueAt: '2026-11-02T08:00:00.000Z' }),
    /validation/,
  )
  assert.deepEqual(await f.written(), before)
  const taken = await f.operations.recordTaken({
    scheduleId: f.id,
    dueAt: '2026-11-02T12:00:00.000Z',
    takenAt: '2026-11-02T12:05:00.000Z',
    quantity: 2,
  })
  assert.equal(taken.outcome, 'Taken')
  assert.equal(await f.count(), 18)
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
