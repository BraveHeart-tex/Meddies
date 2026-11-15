import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'vitest'
import { createWorker } from '../worker/index'
import { parseMedicineRecord } from '../src/features/medicines/contract'
import { startWorkerRuntime, runtime, secret, legacy } from './helpers/medicine-storage-runtime'

startWorkerRuntime()

async function fixture() {
  let now = new Date('2026-11-05T12:00:00.000Z')
  const handler = createWorker(() => now)
  const db = await runtime.getD1Database('DB')
  const ownerId = `google:${randomUUID()}`
  async function request(path: string, command: object, owner = ownerId) {
    const response = await handler.fetch(
      new Request(`http://worker/${path}`, {
        method: 'POST',
        headers: { authorization: `Bearer ${secret}` },
        body: JSON.stringify({ ...command, ownerId: owner }),
      }),
      { DB: db, MEDICINES_WORKER_SECRET: secret },
    )
    const body = await response.json()
    if (!response.ok) throw new Error(String(response.status))
    return body as Record<string, unknown>
  }
  const medicine = { id: randomUUID(), label: 'Example', strength: '200 mg', unit: 'tablet' }
  const list = async (owner = ownerId) => {
    const result = await request('medicines', { operation: 'list' }, owner)
    return (result.medicines as unknown[]).map(parseMedicineRecord)
  }
  await request('medicines', { operation: 'save', medicine })
  return {
    request,
    list,
    medicine,
    setNow(value: string) {
      now = new Date(value)
    },
  }
}

test('migration retains legacy strengths and production reads expose effective periods and dose snapshots', async () => {
  const f = await fixture()
  const [record] = await f.list()
  assert.equal(record.strengthRevisions.length, 1)
  assert.equal(record.strengthRevisions[0].strength, '200 mg')
  assert.equal(record.currentStrengthRevisionId, record.strengthRevisions[0].id)
  assert.equal(record.revision, 0)
  assert.equal(record.everHadSchedule, false)
  assert.equal(record.everHadDose, false)
  const [old] = await f.list(legacy.ownerId)
  assert.equal(old.strength, null)
  assert.equal(old.everHadSchedule, true)
  assert.equal(old.everHadDose, true)
  const result = await f.request(
    'schedules',
    { operation: 'listOutcomes', date: legacy.date },
    legacy.ownerId,
  )
  const dose = (result.records as Record<string, unknown>[])[0]
  assert.equal(dose.strengthRevisionId, old.currentStrengthRevisionId)
  assert.equal(dose.strength, null)
  const [migrated] = await f.list('google:strength-migration')
  assert.equal(migrated.strength, '125 mg')
  assert.equal(migrated.everHadDose, true)
  const unscheduled = await f.request(
    'schedules',
    { operation: 'listOutcomes', date: legacy.date },
    'google:strength-migration',
  )
  const oldDose = (unscheduled.unscheduledDoses as Record<string, unknown>[])[0]
  assert.equal(oldDose.strength, '125 mg')
  assert.equal((unscheduled.records as Record<string, unknown>[])[0].strength, '125 mg')
  assert.equal(oldDose.strengthRevisionId, migrated.currentStrengthRevisionId)
})

test('Detail correction affects only its explicit period and Strength change never rewrites a saved snapshot', async () => {
  const f = await fixture()
  const [initial] = await f.list()
  const input = {
    actionId: randomUUID(),
    medicineId: f.medicine.id,
    takenAt: '2026-11-05T06:00:00.000Z',
    quantity: 1,
  }
  const saved = await f.request('schedules', { operation: 'saveUnscheduled', dose: input })
  const dose = (saved.unscheduledDoses as Record<string, unknown>[])[0]
  assert.equal(dose.strength, '200 mg')
  const change = {
    actionId: randomUUID(),
    medicineId: f.medicine.id,
    expectedRevision: 0,
    strength: '400 mg',
    effectiveAt: '2026-11-05T06:00:00.000Z',
    timeZone: 'Europe/Istanbul',
  }
  const result = await f.request('medicines', { operation: 'changeStrength', change })
  const changed = parseMedicineRecord((result.medicines as unknown[])[0])
  assert.equal(changed.strength, '400 mg')
  assert.equal(changed.revision, 1)
  assert.equal(changed.strengthRevisions[1].effectiveAt, change.effectiveAt)
  const read = () => f.request('schedules', { operation: 'listOutcomes', date: '2026-11-05' })
  assert.equal(((await read()).unscheduledDoses as Record<string, unknown>[])[0].strength, '200 mg')
  const later = await f.request('schedules', {
    operation: 'saveUnscheduled',
    dose: { ...input, actionId: randomUUID(), takenAt: '2026-11-05T07:00:00.000Z' },
  })
  assert.equal((later.unscheduledDoses as Record<string, unknown>[])[0].strength, '400 mg')
  const correction = {
    actionId: randomUUID(),
    medicineId: f.medicine.id,
    expectedRevision: 1,
    strengthRevisionId: initial.currentStrengthRevisionId,
    label: 'Example fixed',
    unit: 'tablet',
    strength: '250 mg',
  }
  const corrected = await f.request('medicines', { operation: 'correctDetails', correction })
  const current = parseMedicineRecord((corrected.medicines as unknown[])[0])
  assert.equal(current.strength, '400 mg')
  assert.equal(current.label, 'Example')
  assert.deepEqual(current.strengthRevisions[0].previousValues, [
    { strength: '200 mg', label: 'Example', unit: 'tablet' },
  ])
  assert.equal(current.strengthRevisions[0].strength, '250 mg')
  const doses = (await read()).unscheduledDoses as Record<string, unknown>[]
  assert.deepEqual(
    doses.map((d) => d.strength),
    ['250 mg', '400 mg'],
  )
  assert.equal(current.strengthRevisions[0].id, dose.strengthRevisionId)
  // Same-attempt retries return the saved receipt after later edits.
  assert.deepEqual(await f.request('medicines', { operation: 'changeStrength', change }), result)
  assert.deepEqual(
    await f.request('medicines', { operation: 'correctDetails', correction }),
    corrected,
  )
  await assert.rejects(
    () =>
      f.request('medicines', {
        operation: 'correctDetails',
        correction: { ...correction, strength: '300 mg' },
      }),
    /409/,
  )
})

test('scheduled Taken time and Skipped transitions resolve snapshots while unchanged time preserves the saved period', async () => {
  const f = await fixture()
  f.setNow('2026-11-05T03:00:00.000Z')
  const schedule = {
    id: randomUUID(),
    medicineId: f.medicine.id,
    startDate: '2026-11-05',
    times: [
      { time: '09:00', quantity: 1 },
      { time: '10:00', quantity: 1 },
    ],
  }
  await f.request('schedules', { operation: 'save', schedule })
  f.setNow('2026-11-05T12:00:00.000Z')
  const first = {
    scheduleId: schedule.id,
    dueAt: '2026-11-05T06:00:00.000Z',
    takenAt: '2026-11-05T06:00:00.000Z',
    quantity: 1,
  }
  const original = await f.request('schedules', { operation: 'recordTaken', record: first })
  assert.equal((original.records as Record<string, unknown>[])[0].strength, '200 mg')
  await f.request('medicines', {
    operation: 'changeStrength',
    change: {
      actionId: randomUUID(),
      medicineId: f.medicine.id,
      expectedRevision: 0,
      strength: '400 mg',
      effectiveAt: first.takenAt,
      timeZone: 'Europe/Istanbul',
    },
  })
  const correction = {
    actionId: randomUUID(),
    scheduleId: schedule.id,
    dueAt: first.dueAt,
    expectedRevision: 0,
    expectedOutcome: 'Taken',
    outcome: 'Taken',
    takenAt: first.takenAt,
    quantity: 2,
  }
  const quantityOnly = await f.request('schedules', { operation: 'correctOutcome', correction })
  assert.equal((quantityOnly.records as Record<string, unknown>[])[0].strength, '200 mg')
  const moved = await f.request('schedules', {
    operation: 'correctOutcome',
    correction: {
      ...correction,
      actionId: randomUUID(),
      expectedRevision: 1,
      takenAt: '2026-11-05T07:00:00.000Z',
    },
  })
  assert.equal((moved.records as Record<string, unknown>[])[0].strength, '400 mg')
  const skipped = await f.request('schedules', {
    operation: 'correctOutcome',
    correction: {
      actionId: randomUUID(),
      scheduleId: schedule.id,
      dueAt: first.dueAt,
      expectedRevision: 2,
      expectedOutcome: 'Taken',
      outcome: 'Skipped',
    },
  })
  assert.equal((skipped.records as Record<string, unknown>[])[0].strength, '400 mg')
  const back = await f.request('schedules', {
    operation: 'correctOutcome',
    correction: {
      ...correction,
      actionId: randomUUID(),
      expectedRevision: 3,
      expectedOutcome: 'Skipped',
      takenAt: '2026-11-05T05:55:00.000Z',
    },
  })
  assert.equal((back.records as Record<string, unknown>[])[0].strength, '200 mg')
  const second = await f.request('schedules', {
    operation: 'recordSkipped',
    record: { scheduleId: schedule.id, dueAt: '2026-11-05T07:00:00.000Z' },
  })
  assert.equal((second.records as Record<string, unknown>[])[0].strength, '400 mg')
  const listed = await f.request('schedules', { operation: 'listOutcomes', date: '2026-11-05' })
  assert.deepEqual((listed.records as Record<string, unknown>[]).map((d) => d.strength).sort(), [
    '200 mg',
    '400 mg',
  ])
})

test('Strength change rejects future and before-latest Taken times atomically and serializes competing dose writes', async () => {
  const f = await fixture()
  const change = {
    actionId: randomUUID(),
    medicineId: f.medicine.id,
    expectedRevision: 0,
    strength: '400 mg',
    effectiveAt: '2026-11-05T06:00:00.000Z',
    timeZone: 'Europe/Istanbul',
  }
  await assert.rejects(
    () =>
      f.request('medicines', {
        operation: 'changeStrength',
        change: { ...change, effectiveAt: '2026-11-05T12:00:01.000Z' },
      }),
    /400/,
  )
  const dose = {
    actionId: randomUUID(),
    medicineId: f.medicine.id,
    takenAt: '2026-11-05T07:00:00.000Z',
    quantity: 1,
  }
  const results = await Promise.allSettled([
    f.request('schedules', { operation: 'saveUnscheduled', dose }),
    f.request('medicines', { operation: 'changeStrength', change }),
  ])
  assert.equal(results[0].status, 'fulfilled')
  const [current] = await f.list()
  const read = await f.request('schedules', { operation: 'listOutcomes', date: '2026-11-05' })
  const saved = (read.unscheduledDoses as Record<string, unknown>[])[0]
  if (results[1].status === 'fulfilled') {
    assert.equal(saved.strength, '400 mg')
    assert.equal(current.revision, 1)
  } else {
    assert.match(results[1].reason.message, /400/)
    assert.equal(saved.strength, '200 mg')
    assert.equal(current.revision, 0)
  }
  await assert.rejects(
    () =>
      f.request('medicines', {
        operation: 'changeStrength',
        change: { ...change, actionId: randomUUID(), expectedRevision: current.revision },
      }),
    /400/,
  )
  assert.deepEqual(await f.list(), [current])
})

test('usage facts survive removal and stopped schedules; locks, owner scope, stale revisions and action retries apply atomically', async () => {
  const f = await fixture()
  const [initial] = await f.list()
  const correction = {
    actionId: randomUUID(),
    medicineId: f.medicine.id,
    expectedRevision: 0,
    strengthRevisionId: initial.currentStrengthRevisionId,
    label: 'Fixed',
    strength: '225 mg',
    unit: 'capsule',
  }
  const [one, retry] = await Promise.all([
    f.request('medicines', { operation: 'correctDetails', correction }),
    f.request('medicines', { operation: 'correctDetails', correction }),
  ])
  assert.deepEqual(one, retry)
  assert.equal(parseMedicineRecord((one.medicines as unknown[])[0]).unit, 'capsule')
  await assert.rejects(
    () =>
      f.request('medicines', {
        operation: 'correctDetails',
        correction: { ...correction, actionId: randomUUID() },
      }),
    /409/,
  )
  const other = `google:${randomUUID()}`
  assert.deepEqual(await f.list(other), [])
  await assert.rejects(
    () => f.request('medicines', { operation: 'correctDetails', correction }, other),
    /400/,
  )
  const input = {
    actionId: randomUUID(),
    medicineId: f.medicine.id,
    takenAt: '2026-11-05T06:00:00.000Z',
    quantity: 1,
  }
  const result = await f.request('schedules', { operation: 'saveUnscheduled', dose: input })
  const dose = (result.unscheduledDoses as Record<string, unknown>[])[0]
  await f.request('schedules', {
    operation: 'changeUnscheduled',
    change: { actionId: randomUUID(), doseId: dose.id, expectedRevision: 0, removed: true },
  })
  const [used] = await f.list()
  assert.equal(used.everHadDose, true)
  assert.equal(used.everHadSchedule, false)
  assert.equal(used.latestTakenAt, input.takenAt)
  await assert.rejects(
    () =>
      f.request('medicines', {
        operation: 'correctDetails',
        correction: { ...correction, actionId: randomUUID(), expectedRevision: 1, unit: 'tablet' },
      }),
    /400/,
  )
  assert.deepEqual(await f.list(), [used])
  // Unknown period, changed retry payload and stale competing attempts leave everything intact.
  await assert.rejects(
    () =>
      f.request('medicines', {
        operation: 'correctDetails',
        correction: {
          ...correction,
          actionId: randomUUID(),
          expectedRevision: 1,
          strengthRevisionId: randomUUID(),
        },
      }),
    /400/,
  )
  const commands = [300, 350].map((strength) => ({
    ...correction,
    actionId: randomUUID(),
    expectedRevision: 1,
    strength: `${strength} mg`,
  }))
  const competing = await Promise.allSettled(
    commands.map((c) => f.request('medicines', { operation: 'correctDetails', correction: c })),
  )
  assert.equal(competing.filter((r) => r.status === 'fulfilled').length, 1)
  assert.equal((await f.list())[0].revision, 2)
  assert.deepEqual(await f.request('medicines', { operation: 'correctDetails', correction }), one)
  assert.deepEqual(await f.request('medicines', { operation: 'save', medicine: f.medicine }), {
    medicines: [initial],
  })

  const g = await fixture()
  g.setNow('2026-11-05T03:00:00.000Z')
  const schedule = {
    id: randomUUID(),
    medicineId: g.medicine.id,
    startDate: '2026-11-05',
    times: [{ time: '09:00', quantity: 1 }],
  }
  await g.request('schedules', { operation: 'save', schedule })
  await g.request('schedules', {
    operation: 'stop',
    stop: { id: randomUUID(), basedOnId: schedule.id },
  })
  const [stopped] = await g.list()
  assert.equal(stopped.everHadSchedule, true)
  assert.equal(stopped.everHadDose, false)
  await assert.rejects(
    () =>
      g.request('medicines', {
        operation: 'correctDetails',
        correction: {
          ...correction,
          medicineId: g.medicine.id,
          strengthRevisionId: stopped.currentStrengthRevisionId,
        },
      }),
    /400/,
  )
})

test('Unscheduled time correction crosses periods and keeps an explicitly corrected snapshot on quantity-only edits', async () => {
  const f = await fixture()
  const [initial] = await f.list()
  const input = {
    actionId: randomUUID(),
    medicineId: f.medicine.id,
    takenAt: '2026-11-05T06:00:00.000Z',
    quantity: 1,
  }
  await f.request('schedules', { operation: 'saveUnscheduled', dose: input })
  await f.request('medicines', {
    operation: 'changeStrength',
    change: {
      actionId: randomUUID(),
      medicineId: f.medicine.id,
      expectedRevision: 0,
      strength: '400 mg',
      effectiveAt: input.takenAt,
      timeZone: 'Europe/Istanbul',
    },
  })
  await f.request('medicines', {
    operation: 'correctDetails',
    correction: {
      actionId: randomUUID(),
      medicineId: f.medicine.id,
      expectedRevision: 1,
      strengthRevisionId: initial.currentStrengthRevisionId,
      label: 'Corrected earlier label',
      strength: '250 mg',
      unit: 'tablet',
    },
  })
  const change = {
    actionId: randomUUID(),
    doseId: input.actionId,
    expectedRevision: 0,
    removed: false,
    takenAt: input.takenAt,
    quantity: 2,
  }
  const sameTime = await f.request('schedules', { operation: 'changeUnscheduled', change })
  const saved = (sameTime.unscheduledDoses as Record<string, unknown>[])[0]
  assert.equal(saved.strength, '250 mg')
  assert.equal(saved.medicineLabel, 'Corrected earlier label')
  const moved = await f.request('schedules', {
    operation: 'changeUnscheduled',
    change: {
      ...change,
      actionId: randomUUID(),
      expectedRevision: 1,
      takenAt: '2026-11-05T07:00:00.000Z',
    },
  })
  assert.equal((moved.unscheduledDoses as Record<string, unknown>[])[0].strength, '400 mg')
  assert.equal((moved.unscheduledDoses as Record<string, unknown>[])[0].medicineLabel, 'Example')
  const earlier = await f.request('schedules', {
    operation: 'changeUnscheduled',
    change: {
      ...change,
      actionId: randomUUID(),
      expectedRevision: 2,
      takenAt: '2026-11-05T05:00:00.000Z',
    },
  })
  assert.equal((earlier.unscheduledDoses as Record<string, unknown>[])[0].strength, '250 mg')
})

test('first schedule or dose use racing a Type correction cannot persist quantities validated for another unit', async () => {
  for (const use of ['schedule', 'dose']) {
    const f = await fixture()
    const [initial] = await f.list()
    f.setNow('2026-11-05T03:00:00.000Z')
    const correction = {
      actionId: randomUUID(),
      medicineId: f.medicine.id,
      expectedRevision: 0,
      strengthRevisionId: initial.currentStrengthRevisionId,
      label: 'Capsule',
      strength: '200 mg',
      unit: 'capsule',
    }
    const write =
      use === 'schedule'
        ? {
            operation: 'save',
            schedule: {
              id: randomUUID(),
              medicineId: f.medicine.id,
              startDate: '2026-11-05',
              times: [{ time: '09:00', quantity: 0.5 }],
            },
          }
        : {
            operation: 'saveUnscheduled',
            dose: {
              actionId: randomUUID(),
              medicineId: f.medicine.id,
              takenAt: '2026-11-05T02:00:00.000Z',
              quantity: 0.5,
            },
          }
    const results = await Promise.allSettled([
      f.request('medicines', { operation: 'correctDetails', correction }),
      f.request('schedules', write),
    ])
    assert.ok(results.some((r) => r.status === 'fulfilled'))
    assert.ok(results.some((r) => r.status === 'rejected'))
    const [saved] = await f.list()
    if (saved.unit === 'capsule') {
      assert.equal(saved.everHadSchedule, false)
      assert.equal(saved.everHadDose, false)
    } else {
      assert.ok(saved.everHadSchedule || saved.everHadDose)
    }
  }
})

test('a never-used Medicine keeps one Quantity unit across periods when an earlier period is corrected', async () => {
  const f = await fixture()
  const [initial] = await f.list()
  await f.request('medicines', {
    operation: 'changeStrength',
    change: {
      actionId: randomUUID(),
      medicineId: f.medicine.id,
      expectedRevision: 0,
      strength: '400 mg',
      effectiveAt: '2026-11-05T06:00:00.000Z',
      timeZone: 'Europe/Istanbul',
    },
  })
  await f.request('medicines', {
    operation: 'correctDetails',
    correction: {
      actionId: randomUUID(),
      medicineId: f.medicine.id,
      expectedRevision: 1,
      strengthRevisionId: initial.currentStrengthRevisionId,
      label: 'Earlier label',
      strength: '250 mg',
      unit: 'capsule',
    },
  })
  const [current] = await f.list()
  assert.equal(current.unit, 'capsule')
  assert.equal(current.label, 'Example')
  assert.ok(current.strengthRevisions.every((period) => period.unit === 'capsule'))
  await assert.rejects(
    () =>
      f.request('schedules', {
        operation: 'saveUnscheduled',
        dose: {
          actionId: randomUUID(),
          medicineId: f.medicine.id,
          takenAt: '2026-11-05T05:00:00.000Z',
          quantity: 0.5,
        },
      }),
    /400/,
  )
})
