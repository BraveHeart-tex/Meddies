import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'vitest'
import { createWorker } from '../worker/index'
import { runtime, secret, startWorkerRuntime } from './helpers/medicine-storage-runtime'

// #267: Inhaler and Drops persist whole puff and drop amounts through the real Worker and D1.
startWorkerRuntime()

const now = new Date('2026-11-16T12:00:00.000Z')
const handler = createWorker(() => now)
const types = [
  ['inhaler', '100 mcg per puff'],
  ['drops', '0.5%'],
] as const
// Fractional, zero, negative and unsafe amounts.
const invalid = [0.5, 1.5, 0, -1, Number.MAX_SAFE_INTEGER]

async function fixture(unit: string, strength: string | null = null) {
  const ownerId = `google:${randomUUID()}`
  const db = (await runtime.getD1Database('DB')) as unknown as D1Database
  const send = async (path: string, command: object, owner = ownerId) => {
    const response = await handler.fetch(
      new Request(`http://worker/${path}`, {
        method: 'POST',
        headers: { authorization: `Bearer ${secret}` },
        body: JSON.stringify({ ...command, ownerId: owner }),
      }),
      { DB: db, MEDICINES_WORKER_SECRET: secret },
    )
    const body = await response.json()
    if (!response.ok) throw new Error(`${response.status}: ${JSON.stringify(body)}`)
    return body as Record<string, Record<string, unknown>[]>
  }
  const m = { id: randomUUID(), label: 'Example', strength, unit }
  const saved = await send('medicines', { operation: 'save', medicine: m })
  return { m, send, saved }
}

function clock(medicineId: string, quantity = 1) {
  return {
    id: randomUUID(),
    medicineId,
    startDate: '2026-11-16',
    times: [{ time: '16:00', quantity }],
  }
}

test('the Worker rejects Injection and unknown Types', async () => {
  for (const unit of ['injection', 'puff', 'unknown'])
    await assert.rejects(() => fixture(unit), /400/)
})

test.each(types)(
  '%s Medicines save, retry exactly and reload with their Type',
  async (unit, strength) => {
    const f = await fixture(unit, strength)
    assert.equal(f.saved.medicines[0].unit, unit)
    assert.equal(f.saved.medicines[0].strength, strength)
    assert.deepEqual(await f.send('medicines', { operation: 'save', medicine: f.m }), f.saved)
    const list = await f.send('medicines', { operation: 'list' })
    assert.equal(list.medicines.find((m) => m.id === f.m.id)?.unit, unit)
  },
)

test.each(types)(
  '%s Clock and Interval Schedule versions keep whole amounts and reject the rest',
  async (unit) => {
    for (const intervalHours of [undefined, 6]) {
      const f = await fixture(unit)
      const initial = { ...clock(f.m.id, 2), intervalHours }
      for (const quantity of invalid)
        await assert.rejects(
          () =>
            f.send('schedules', {
              operation: 'save',
              schedule: { ...initial, times: [{ time: '16:00', quantity }] },
            }),
          /400/,
        )
      const saved = await f.send('schedules', { operation: 'save', schedule: initial })
      assert.deepEqual(saved.schedules[0].times, [{ time: '16:00', quantity: 2 }])
      assert.deepEqual(await f.send('schedules', { operation: 'save', schedule: initial }), saved)
      const edit = {
        id: randomUUID(),
        basedOnId: initial.id,
        endDate: null,
        intervalHours,
        ...(intervalHours ? { anchorDate: '2026-11-16' } : {}),
        times: [{ time: '17:00', quantity: 3 }],
      }
      for (const quantity of invalid)
        await assert.rejects(
          () =>
            f.send('schedules', {
              operation: 'edit',
              edit: { ...edit, times: [{ time: '17:00', quantity }] },
            }),
          /400/,
        )
      const changed = await f.send('schedules', { operation: 'edit', edit })
      assert.deepEqual(changed.schedules[0].times, [{ time: '17:00', quantity: 3 }])
      assert.deepEqual(await f.send('schedules', { operation: 'edit', edit }), changed)
      const read = await f.send('schedules', { operation: 'listOutcomes', date: '2026-11-16' })
      assert.deepEqual(read.schedules.find((s) => s.id === initial.id)?.times, [
        { time: '16:00', quantity: 2 },
      ])
      assert.deepEqual(read.schedules.find((s) => s.id === edit.id)?.times, [
        { time: '17:00', quantity: 3 },
      ])
    }
  },
)

test.each(types)(
  '%s scheduled Taken doses and corrections keep whole amounts with exact retries',
  async (unit) => {
    const f = await fixture(unit)
    const schedule = clock(f.m.id)
    await f.send('schedules', { operation: 'save', schedule })
    const record = {
      scheduleId: schedule.id,
      dueAt: '2026-11-16T13:00:00.000Z',
      takenAt: now.toISOString(),
      quantity: 2,
    }
    for (const quantity of invalid)
      await assert.rejects(
        () => f.send('schedules', { operation: 'recordTaken', record: { ...record, quantity } }),
        /400/,
      )
    const saved = await f.send('schedules', { operation: 'recordTaken', record })
    assert.equal(saved.records[0].quantity, 2)
    assert.equal(saved.records[0].unit, unit)
    assert.deepEqual(await f.send('schedules', { operation: 'recordTaken', record }), saved)
    const correction = {
      ...record,
      actionId: randomUUID(),
      expectedRevision: 0,
      expectedOutcome: 'Taken',
      outcome: 'Taken',
      quantity: 4,
    }
    for (const quantity of invalid)
      await assert.rejects(
        () =>
          f.send('schedules', {
            operation: 'correctOutcome',
            correction: { ...correction, quantity },
          }),
        /400/,
      )
    const changed = await f.send('schedules', { operation: 'correctOutcome', correction })
    assert.equal(changed.records[0].quantity, 4)
    assert.equal(changed.records[0].revision, 1)
    assert.deepEqual(
      await f.send('schedules', { operation: 'correctOutcome', correction }),
      changed,
    )
    const read = await f.send('schedules', { operation: 'listOutcomes', date: '2026-11-16' })
    assert.equal(read.records[0].quantity, 4)
    assert.equal(read.records[0].unit, unit)
  },
)

test.each(types)(
  '%s Unscheduled doses and changes keep whole amounts with exact action retries',
  async (unit, strength) => {
    const f = await fixture(unit, strength)
    const dose = {
      actionId: randomUUID(),
      medicineId: f.m.id,
      takenAt: now.toISOString(),
      quantity: 1,
    }
    for (const quantity of invalid)
      await assert.rejects(
        () => f.send('schedules', { operation: 'saveUnscheduled', dose: { ...dose, quantity } }),
        /400/,
      )
    const saved = await f.send('schedules', { operation: 'saveUnscheduled', dose })
    assert.equal(saved.unscheduledDoses[0].quantity, 1)
    assert.equal(saved.unscheduledDoses[0].unit, unit)
    assert.equal(saved.unscheduledDoses[0].strength, strength)
    const change = {
      actionId: randomUUID(),
      doseId: saved.unscheduledDoses[0].id,
      expectedRevision: 0,
      removed: false,
      takenAt: dose.takenAt,
      quantity: 3,
    }
    for (const quantity of invalid)
      await assert.rejects(
        () =>
          f.send('schedules', { operation: 'changeUnscheduled', change: { ...change, quantity } }),
        /400/,
      )
    const changed = await f.send('schedules', { operation: 'changeUnscheduled', change })
    assert.equal(changed.unscheduledDoses[0].quantity, 3)
    assert.equal(changed.unscheduledDoses[0].revision, 1)
    assert.deepEqual(await f.send('schedules', { operation: 'saveUnscheduled', dose }), saved)
    assert.deepEqual(await f.send('schedules', { operation: 'changeUnscheduled', change }), changed)
    const read = await f.send('schedules', { operation: 'listOutcomes', date: '2026-11-16' })
    assert.equal(read.unscheduledDoses[0].quantity, 3)
    assert.equal(read.unscheduledDoses[0].unit, unit)
  },
)
