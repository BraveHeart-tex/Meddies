import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'vitest'
import { createWorker } from '../worker/index'
import { createMedicineOperations } from '../src/features/medicines/operations'
import { createScheduleOperations } from '../src/features/schedules/operations'
import type { Medicine } from '../src/features/medicines/contract'
import { startWorkerRuntime, runtime, secret, legacy } from './helpers/medicine-storage-runtime'

// Archive (#322) on real D1: one insert stops the schedule at the Edit time, archives the
// Medicine and stores the receipt. No reminder sender exists yet (#30, #38, #53), so these
// tests prove the persisted facts senders must honor and the existing occurrence boundary.
startWorkerRuntime()

async function fixture() {
  let now = new Date('2026-11-02T04:00:00.000Z')
  const handler = createWorker(() => now)
  const db = await runtime.getD1Database('DB')
  const ownerId = `google:${randomUUID()}`
  const post = async (path: string, command: object) => {
    const response = await handler.fetch(
      new Request(`http://worker/${path}`, {
        method: 'POST',
        headers: { authorization: `Bearer ${secret}` },
        body: JSON.stringify(command),
      }),
      { DB: db, MEDICINES_WORKER_SECRET: secret },
    )
    const body = (await response.json()) as Record<string, unknown>
    if (!response.ok) throw new Error(String(body.error ?? response.status))
    return body
  }
  const operationsFor = (owner: string) => ({
    medicines: createMedicineOperations({
      requireUser: async () => ({ id: owner }),
      send: async (command) => (await post('medicines', command)).medicines as Medicine[],
    }),
    schedules: createScheduleOperations({
      requireUser: async () => ({ id: owner }),
      send: (async (command: object) => post('schedules', command)) as never,
      now: () => now,
    }),
  })
  const { medicines, schedules } = operationsFor(ownerId)
  const medicineId = randomUUID()
  await medicines.save({ id: medicineId, label: 'Example', strength: '200 mg', unit: 'tablet' })
  const scheduleId = randomUUID()
  const record = async () => {
    const list = (await medicines.list()) as { id: string; revision?: number }[]
    return list.find((item) => item.id === medicineId) as Awaited<
      ReturnType<typeof medicines.archive>
    >[0]
  }
  const archive = async (actionId = randomUUID(), expectedRevision?: number) =>
    (
      await medicines.archive({
        actionId,
        medicineId,
        expectedRevision: expectedRevision ?? (await record()).revision,
      })
    )[0]
  const row = (sql: string, ...values: unknown[]) =>
    db
      .prepare(sql)
      .bind(...values)
      .first<Record<string, unknown>>()
  return {
    db,
    ownerId,
    medicines,
    schedules,
    operationsFor,
    medicineId,
    scheduleId,
    record,
    archive,
    row,
    setNow(value: string) {
      now = new Date(value)
    },
    saveDaily: () =>
      schedules.save({
        id: scheduleId,
        medicineId,
        startDate: '2026-11-02',
        times: [
          { time: '08:00', quantity: 1 },
          { time: '20:00', quantity: 1 },
        ],
      }),
  }
}

const doses = (snapshot: { today: { doses: { dueAt: string; status: string }[] } }) =>
  snapshot.today.doses.map((d) => [d.dueAt, d.status])

test('archive stops the schedule at the Edit time and keeps due and recorded doses', async () => {
  const f = await fixture()
  await f.saveDaily()
  f.setNow('2026-11-03T10:30:00.000Z')
  const early = { scheduleId: f.scheduleId, dueAt: '2026-11-03T17:00:00.000Z' }
  await f.schedules.recordTaken({ ...early, takenAt: '2026-11-03T10:30:00.000Z', quantity: 1 })
  f.setNow('2026-11-03T11:00:00.000Z')
  const actionId = randomUUID()
  const saved = await f.archive(actionId)
  assert.equal(saved.archivedAt, '2026-11-03T11:00:00.000Z')
  assert.equal(saved.revision, 1)
  assert.equal(saved.lastActionId, actionId)

  const snapshot = await f.schedules.snapshot()
  const head = snapshot.schedules.find((s) => s.basedOnId === f.scheduleId)
  assert.equal(head?.stoppedAt, '2026-11-03T11:00:00.000Z')
  // Due by the Edit time and the already recorded later dose stay; nothing after is expected.
  assert.deepEqual(doses(snapshot), [
    ['2026-11-02T17:00:00.000Z', 'Not logged'],
    ['2026-11-03T05:00:00.000Z', 'Not logged'],
    [early.dueAt, 'Taken'],
  ])
  assert.equal(snapshot.today.next, null)

  // Persisted facts future dose, food and refill senders must honor.
  const archived = await f.row(
    'SELECT a.stopped_schedule_id AS stop, m.archived_at AS at FROM medicine_archives a JOIN user_medications m ON m.owner_id=a.owner_id AND m.id=a.medicine_id WHERE a.owner_id=? AND a.action_id=?',
    f.ownerId,
    actionId,
  )
  assert.deepEqual(archived, { stop: head?.id, at: '2026-11-03T11:00:00.000Z' })

  // History correction still works for retained doses; outcomes and snapshots stay.
  await f.schedules.recordSkipped({ scheduleId: f.scheduleId, dueAt: '2026-11-03T05:00:00.000Z' })
  await f.schedules.correctOutcome({
    ...early,
    actionId: randomUUID(),
    expectedRevision: 0,
    expectedOutcome: 'Taken',
    outcome: 'Taken',
    takenAt: '2026-11-03T10:45:00.000Z',
    quantity: 1,
  })
  f.setNow('2026-11-04T07:00:00.000Z')
  assert.deepEqual(doses(await f.schedules.snapshot()), [])
  const history = await f.schedules.history('2026-11-03')
  assert.deepEqual(
    history.map((d) => [d.dueAt, d.status]),
    [
      ['2026-11-03T05:00:00.000Z', 'Skipped'],
      [early.dueAt, 'Taken'],
    ],
  )
  const taken = await f.row(
    'SELECT strength,medicine_label AS label,quantity FROM dose_records WHERE owner_id=? AND due_at=?',
    f.ownerId,
    early.dueAt,
  )
  assert.deepEqual(taken, { strength: '200 mg', label: 'Example', quantity: 1 })

  // Detail correction stays available to an archived record and keeps it archived.
  const current = await f.record()
  const [fixed] = await f.medicines.correctDetails({
    actionId: randomUUID(),
    medicineId: f.medicineId,
    expectedRevision: current.revision,
    strengthRevisionId: current.currentStrengthRevisionId,
    label: 'Example',
    strength: '250 mg',
    unit: 'tablet',
  })
  assert.equal(fixed.archivedAt, '2026-11-03T11:00:00.000Z')
})

test('archive receipts replay by action, scope to the owner and reject stale state', async () => {
  const f = await fixture()
  const actionId = randomUUID()
  const first = await f.archive(actionId, 0)
  assert.deepEqual(await f.archive(actionId, 0), first)
  await assert.rejects(() => f.archive(actionId, 1), /conflict/)
  await assert.rejects(() => f.archive(randomUUID(), 1), /conflict/)
  await assert.rejects(() => f.archive(randomUUID(), 0), /conflict/)
  // Another owner can neither archive nor read it.
  const other = f.operationsFor(`google:${randomUUID()}`)
  await assert.rejects(
    () =>
      other.medicines.archive({
        actionId: randomUUID(),
        medicineId: f.medicineId,
        expectedRevision: 0,
      }),
    /validation/,
  )
  assert.equal(((await other.medicines.list()) as unknown[]).length, 0)
  // The owner's list keeps the archived record for History and Detail correction.
  assert.equal((await f.record()).archivedAt, first.archivedAt)
  // Without a schedule it stops nothing, and no schedule can start afterwards.
  assert.equal(
    (
      await f.row(
        'SELECT stopped_schedule_id AS s FROM medicine_archives WHERE action_id=?',
        actionId,
      )
    )?.s,
    null,
  )
  await assert.rejects(() => f.saveDaily(), /conflict/)
})

test('a schedule change racing the archive never leaves the Medicine expecting doses', async () => {
  const f = await fixture()
  await f.saveDaily()
  f.setNow('2026-11-03T09:00:00.000Z')
  // The change lands first: the archive stops the version it created.
  const changed = randomUUID()
  await f.schedules.edit({
    id: changed,
    basedOnId: f.scheduleId,
    endDate: null,
    times: [{ time: '21:00', quantity: 1 }],
  })
  await f.archive()
  const versions = (await f.schedules.snapshot()).schedules
  assert.equal(versions.find((s) => s.basedOnId === changed)?.stoppedAt, '2026-11-03T09:00:00.000Z')
  // Later changes based on any version, including a restart of the stop, are refused.
  for (const basedOnId of versions.map((s) => s.id))
    await assert.rejects(
      () =>
        f.schedules.edit({
          id: randomUUID(),
          basedOnId,
          endDate: null,
          times: [{ time: '22:00', quantity: 1 }],
        }),
      /conflict/,
    )
  // 23:00 Istanbul: neither the replaced 20:00 nor the changed 21:00 is expected.
  f.setNow('2026-11-03T20:00:00.000Z')
  assert.deepEqual(doses(await f.schedules.snapshot()), [
    ['2026-11-03T05:00:00.000Z', 'Not logged'],
  ])
})

test('archive stops a paused schedule and leaves an Ended one as it is', async () => {
  const paused = await fixture()
  await paused.saveDaily()
  paused.setNow('2026-11-03T09:00:00.000Z')
  const pauseId = randomUUID()
  await paused.schedules.pause({ id: pauseId, basedOnId: paused.scheduleId })
  paused.setNow('2026-11-03T10:00:00.000Z')
  await paused.archive()
  const stop = (await paused.schedules.snapshot()).schedules.find((s) => s.basedOnId === pauseId)
  assert.deepEqual([stop?.stoppedAt, stop?.pausedAt], ['2026-11-03T10:00:00.000Z', null])

  const ended = await fixture()
  await ended.schedules.save({
    id: ended.scheduleId,
    medicineId: ended.medicineId,
    startDate: '2026-11-02',
    endDate: '2026-11-02',
    times: [{ time: '08:00', quantity: 1 }],
  })
  ended.setNow('2026-11-03T10:00:00.000Z')
  const saved = await ended.archive()
  assert.equal(saved.archivedAt, '2026-11-03T10:00:00.000Z')
  assert.equal((await ended.schedules.snapshot()).schedules.length, 1)
})

test('migrated medicines stay active', async () => {
  const f = await fixture()
  const list = await f.operationsFor(legacy.ownerId).medicines.list()
  assert.equal((list[0] as { archivedAt?: unknown }).archivedAt, null)
  assert.equal((await f.record()).archivedAt, null)
})
