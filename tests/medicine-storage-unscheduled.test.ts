import type {
  ScheduleCommand,
  ScheduleResponse,
  SendSchedule,
} from '../src/features/schedules/contract'
import type { Medicine } from '../src/features/medicines/contract'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'vitest'
import { createWorker } from '../worker/index'
import { createScheduleOperations } from '../src/features/schedules/operations'
import {
  startWorkerRuntime,
  runtime,
  secret,
  medicine,
  call,
} from './helpers/medicine-storage-runtime'

// Unscheduled doses on real D1.
startWorkerRuntime()

async function unscheduledFixture(unit: Medicine['unit'] = 'tablet') {
  let now = new Date('2026-11-03T11:10:00.000Z')
  const handler = createWorker(() => now)
  const db = await runtime.getD1Database('DB')
  const ownerId = `google:${randomUUID()}`
  const tablet = { ...medicine, unit, id: randomUUID() }
  await call({ operation: 'save', ownerId, medicine: tablet })
  const send: SendSchedule = async <C extends ScheduleCommand>(command: C) => {
    const response = await handler.fetch(
      new Request('http://worker/schedules', {
        method: 'POST',
        headers: { authorization: `Bearer ${secret}` },
        body: JSON.stringify(command),
      }),
      { DB: db, MEDICINES_WORKER_SECRET: secret },
    )
    if (!response.ok) throw new Error(String(response.status))
    return (await response.json()) as ScheduleResponse<C>
  }
  const forOwner = (id: string) =>
    createScheduleOperations({ requireUser: async () => ({ id }), send, now: () => now })
  const operations = forOwner(ownerId)
  const input = {
    actionId: randomUUID(),
    medicineId: tablet.id,
    takenAt: now.toISOString(),
    quantity: 0.5,
  }
  return {
    operations,
    input,
    forOwner,
    setNow(value: string) {
      now = new Date(value)
    },
  }
}

test('Unscheduled dose saves without a schedule and reads on its History date', async () => {
  const { operations, input } = await unscheduledFixture()
  const saved = await operations.saveUnscheduled(input)
  assert.equal(saved.outcome, 'Taken')
  assert.deepEqual((await operations.snapshot()).unscheduledDoses, [saved])
  assert.deepEqual((await operations.historySnapshot('2026-11-03')).unscheduledDoses, [saved])
  assert.equal((await operations.snapshot()).today.next, null)
})

test('Unscheduled dose retries retain separate actions and reject invalid intake and another owner', async () => {
  const f = await unscheduledFixture('capsule')
  const input = { ...f.input, quantity: 1 }
  const [first, retry] = await Promise.all([
    f.operations.saveUnscheduled(input),
    f.operations.saveUnscheduled(input),
  ])
  assert.deepEqual(retry, first)
  const second = await f.operations.saveUnscheduled({ ...input, actionId: randomUUID() })
  assert.notEqual(first.id, second.id)
  assert.deepEqual(
    (await f.operations.snapshot()).unscheduledDoses.map((d) => d.id).sort(),
    [first.id, second.id].sort(),
  )
  await assert.rejects(() => f.operations.saveUnscheduled({ ...input, quantity: 2 }), /409/)
  for (const invalid of [
    { takenAt: '2026-11-03T11:11:00.000Z' },
    { takenAt: '2026-11-01T11:10:00.000Z' },
    { quantity: 0.5 },
  ])
    await assert.rejects(
      () => f.operations.saveUnscheduled({ ...input, actionId: randomUUID(), ...invalid }),
      /400/,
    )
  await assert.rejects(
    () =>
      f.operations.changeUnscheduled({
        actionId: randomUUID(),
        doseId: first.id,
        expectedRevision: 0,
        removed: false,
        takenAt: input.takenAt,
        quantity: 0.5,
      }),
    /400/,
  )
  const other = f.forOwner('google:unscheduled-other')
  await assert.rejects(() => other.saveUnscheduled({ ...input, actionId: randomUUID() }), /400/)
  assert.deepEqual((await other.snapshot()).unscheduledDoses, [])
  const change = {
    actionId: randomUUID(),
    doseId: first.id,
    expectedRevision: 0,
    removed: false,
    takenAt: input.takenAt,
    quantity: 2,
  }
  await assert.rejects(() => other.changeUnscheduled(change), /400/)
  await assert.rejects(
    () =>
      other.changeUnscheduled({
        actionId: randomUUID(),
        doseId: first.id,
        expectedRevision: 0,
        removed: true,
      }),
    /400/,
  )
  f.setNow('2026-11-06T11:10:00.000Z')
  assert.deepEqual(await f.operations.saveUnscheduled(input), first)
})

test('Unscheduled dose revisions change History date, reject stale edits, and retain removal retries', async () => {
  const f = await unscheduledFixture()
  const original = await f.operations.saveUnscheduled(f.input)
  const change = {
    actionId: randomUUID(),
    doseId: original.id,
    expectedRevision: 0,
    removed: false,
    takenAt: '2026-11-02T20:30:00.000Z',
    quantity: 1.5,
  }
  const changed = await f.operations.changeUnscheduled(change)
  assert.equal(changed.revision, 1)
  assert.deepEqual(await f.operations.changeUnscheduled(change), changed)
  assert.deepEqual((await f.operations.historySnapshot('2026-11-02')).unscheduledDoses, [changed])
  assert.deepEqual((await f.operations.snapshot()).unscheduledDoses, [])
  await assert.rejects(
    () => f.operations.changeUnscheduled({ ...change, actionId: randomUUID() }),
    /409/,
  )
  await assert.rejects(() => f.operations.changeUnscheduled({ ...change, quantity: 2 }), /409/)
  for (const invalid of [
    { takenAt: '2026-11-03T11:11:00.000Z' },
    { takenAt: '2026-11-01T11:10:00.000Z' },
  ])
    await assert.rejects(
      () =>
        f.operations.changeUnscheduled({
          ...change,
          actionId: randomUUID(),
          expectedRevision: 1,
          ...invalid,
        }),
      /400/,
    )
  const removal = {
    actionId: randomUUID(),
    doseId: original.id,
    expectedRevision: 1,
    removed: true,
  }
  const removed = await f.operations.changeUnscheduled(removal)
  assert.equal(removed.removed, true)
  assert.equal(removed.revision, 2)
  assert.deepEqual((await f.operations.historySnapshot('2026-11-02')).unscheduledDoses, [])
  f.setNow('2026-11-06T11:10:00.000Z')
  assert.deepEqual(await f.operations.changeUnscheduled(removal), removed)
  assert.deepEqual(await f.operations.changeUnscheduled(change), changed)
  assert.deepEqual(await f.operations.saveUnscheduled(f.input), original)
})

test('Unscheduled dose Cross-midnight reads on Nov 3, not Nov 4', async () => {
  const f = await unscheduledFixture()
  f.setNow('2026-11-03T21:20:00.000Z')
  const saved = await f.operations.saveUnscheduled({
    ...f.input,
    takenAt: '2026-11-03T20:30:00.000Z',
  })
  assert.deepEqual((await f.operations.snapshot()).unscheduledDoses, [])
  assert.deepEqual((await f.operations.historySnapshot('2026-11-04')).unscheduledDoses, [])
  assert.deepEqual((await f.operations.historySnapshot('2026-11-03')).unscheduledDoses, [saved])
})

test('Unscheduled dose beside running, paused and Ended schedules leaves Occurrences and next doses unchanged', async () => {
  const f = await unscheduledFixture()
  f.setNow('2026-11-03T04:00:00.000Z')
  const schedule = {
    id: randomUUID(),
    medicineId: f.input.medicineId,
    startDate: '2026-11-03',
    times: [
      { time: '08:00', quantity: 1 },
      { time: '20:00', quantity: 1 },
    ],
  }
  await f.operations.save(schedule)
  f.setNow('2026-11-03T11:10:00.000Z')
  const before = await f.operations.snapshot()
  assert.equal(before.today.doses[0].status, 'Not logged')
  assert.equal(before.today.next?.dueAt, '2026-11-03T17:00:00.000Z')
  const historyBefore = await f.operations.history('2026-11-03')
  await f.operations.saveUnscheduled(f.input)
  assert.deepEqual((await f.operations.snapshot()).today, before.today)
  assert.deepEqual(await f.operations.history('2026-11-03'), historyBefore)
  const pausedId = randomUUID()
  await f.operations.pause({ id: pausedId, basedOnId: schedule.id })
  const paused = await f.operations.snapshot()
  await f.operations.saveUnscheduled({ ...f.input, actionId: randomUUID() })
  assert.deepEqual((await f.operations.snapshot()).today, paused.today)
  await f.operations.stop({ id: randomUUID(), basedOnId: pausedId })
  const ended = await f.operations.snapshot()
  await f.operations.saveUnscheduled({ ...f.input, actionId: randomUUID() })
  const after = await f.operations.snapshot()
  assert.equal(after.unscheduledDoses.length, 3)
  assert.deepEqual(after.today, ended.today)
  assert.deepEqual(after.records, before.records)
})

test('Unscheduled dose concurrent changes append one revision and reconcile identical retries', async () => {
  const f = await unscheduledFixture()
  const original = await f.operations.saveUnscheduled(f.input)
  const change = {
    actionId: randomUUID(),
    doseId: original.id,
    expectedRevision: 0,
    removed: false,
    takenAt: f.input.takenAt,
    quantity: 2,
  }
  const [changed, retry] = await Promise.all([
    f.operations.changeUnscheduled(change),
    f.operations.changeUnscheduled(change),
  ])
  assert.deepEqual(changed, retry)
  const removal = {
    actionId: randomUUID(),
    doseId: original.id,
    expectedRevision: 1,
    removed: true,
  }
  const competing = { ...change, actionId: randomUUID(), expectedRevision: 1, quantity: 3 }
  const results = await Promise.allSettled([
    f.operations.changeUnscheduled(removal),
    f.operations.changeUnscheduled(competing),
  ])
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1)
  const failure = results.find((r) => r.status === 'rejected') as PromiseRejectedResult
  assert.match(failure.reason.message, /409/)
  const winner = results.find((r) => r.status === 'fulfilled') as PromiseFulfilledResult<
    typeof changed
  >
  assert.equal(winner.value.revision, 2)
  assert.deepEqual(
    (await f.operations.snapshot()).unscheduledDoses,
    winner.value.removed ? [] : [winner.value],
  )
})
