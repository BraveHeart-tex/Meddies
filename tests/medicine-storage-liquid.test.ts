import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, test } from 'vitest'
import { Miniflare, convertV4MiniflareOptions } from 'miniflare'
import { createWorker } from '../worker/index'
import { applyD1Migrations } from './helpers/d1-migrations.mjs'
import { secret } from './helpers/medicine-storage-runtime'

let runtime: Miniflare
let db: D1Database
const now = new Date('2026-11-16T12:00:00.000Z')
const handler = createWorker(() => now)
const migrationOwner = 'google:liquid-migration'
let before: Record<string, unknown>
let after: Record<string, unknown>
let deletedMedicine: ReturnType<typeof medicine>

function medicine(unit = 'liquid') {
  return { id: randomUUID(), label: 'Amoxicillin', strength: '250 mg/5 ml', unit }
}

async function request(path: string, command: object, ownerId: string) {
  const response = await handler.fetch(
    new Request(`http://worker/${path}`, {
      method: 'POST',
      headers: { authorization: `Bearer ${secret}` },
      body: JSON.stringify({ ...command, ownerId }),
    }),
    { DB: db, MEDICINES_WORKER_SECRET: secret },
  )
  const body = await response.json()
  if (!response.ok) throw new Error(`${response.status}: ${JSON.stringify(body)}`)
  return body as Record<string, Record<string, unknown>[]>
}

async function contents() {
  const { results } = await db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY name",
    )
    .all<{ name: string }>()
  const rows: Record<string, unknown> = {}
  for (const { name } of results) {
    const result = await db.prepare(`SELECT * FROM "${name}"`).all()
    rows[name] = result.results.map((row) => JSON.stringify(row)).sort()
  }
  return rows
}

async function seed() {
  const m = medicine('tablet')
  const send = (path: string, command: object) => request(path, command, migrationOwner)
  await send('medicines', { operation: 'save', medicine: m })
  const schedule = {
    id: randomUUID(),
    medicineId: m.id,
    startDate: '2026-11-16',
    times: [{ time: '16:00', quantity: 0.5 }],
  }
  // Seed the Schedule versions with the pre-0017 write shape. Current Worker
  // Schedule receipts read columns that were introduced by later migrations.
  await db
    .prepare(
      `INSERT INTO daily_schedules(owner_id,id,medicine_id,start_date,times,confirmed_at)
      VALUES(?,?,?,?,?,?)`,
    )
    .bind(
      migrationOwner,
      schedule.id,
      m.id,
      schedule.startDate,
      JSON.stringify(schedule.times),
      now.toISOString(),
    )
    .run()
  const record = {
    scheduleId: schedule.id,
    dueAt: '2026-11-16T13:00:00.000Z',
    takenAt: now.toISOString(),
    quantity: 0.5,
  }
  await send('schedules', { operation: 'recordTaken', record })
  await send('schedules', {
    operation: 'correctOutcome',
    correction: {
      ...record,
      actionId: randomUUID(),
      expectedRevision: 0,
      expectedOutcome: 'Taken',
      outcome: 'Taken',
      quantity: 1.5,
    },
  })
  const edit = {
    id: randomUUID(),
    basedOnId: schedule.id,
    endDate: null,
    times: [{ time: '17:00', quantity: 1 }],
  }
  await db
    .prepare(
      `INSERT INTO daily_schedules(owner_id,id,medicine_id,start_date,times,confirmed_at,based_on_id,edit_request)
      VALUES(?,?,?,?,?,?,?,?)`,
    )
    .bind(
      migrationOwner,
      edit.id,
      m.id,
      schedule.startDate,
      JSON.stringify(edit.times),
      now.toISOString(),
      edit.basedOnId,
      JSON.stringify(edit),
    )
    .run()
  const dose = {
    actionId: randomUUID(),
    medicineId: m.id,
    takenAt: now.toISOString(),
    quantity: 0.5,
  }
  const saved = await send('schedules', { operation: 'saveUnscheduled', dose })
  await send('schedules', {
    operation: 'changeUnscheduled',
    change: {
      actionId: randomUUID(),
      doseId: saved.unscheduledDoses[0].id,
      expectedRevision: 0,
      removed: false,
      takenAt: dose.takenAt,
      quantity: 1.5,
    },
  })
  await send('medicines', {
    operation: 'correctDetails',
    correction: {
      actionId: randomUUID(),
      medicineId: m.id,
      expectedRevision: 0,
      strengthRevisionId: m.id,
      label: 'Corrected',
      strength: '500 mg',
      unit: 'tablet',
    },
  })
  await send('medicines', {
    operation: 'changeStrength',
    change: {
      actionId: randomUUID(),
      medicineId: m.id,
      expectedRevision: 1,
      strength: '750 mg',
      effectiveAt: now.toISOString(),
      timeZone: 'Europe/Istanbul',
    },
  })
  await send('medicines', {
    operation: 'archive',
    archive: { actionId: randomUUID(), medicineId: m.id, expectedRevision: 2 },
  })
  await send('medicines', {
    operation: 'restore',
    restore: { actionId: randomUUID(), medicineId: m.id, expectedRevision: 3 },
  })
  deletedMedicine = medicine('capsule')
  await send('medicines', { operation: 'save', medicine: deletedMedicine })
  await send('medicines', {
    operation: 'delete',
    deletion: { actionId: randomUUID(), medicineId: deletedMedicine.id, expectedRevision: 0 },
  })
}

beforeAll(async () => {
  runtime = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      scriptPath: '.worker-build/index.js',
      compatibilityDate: '2026-11-03',
      d1Databases: ['DB'],
      bindings: { MEDICINES_WORKER_SECRET: secret },
    }),
  )
  db = (await runtime.getD1Database('DB')) as unknown as D1Database
  await applyD1Migrations(db, {
    async afterMigration(file) {
      if (file === '0016_medicine_deletions.sql') {
        await seed()
        before = await contents()
      }
      if (file === '0017_liquid_quantities.sql') after = await contents()
    },
  })
})
afterAll(async () => {
  await runtime?.dispose()
})

test('Liquid migration preserves every existing row and receipt and recreates first-strength, unit-lock and deletion guards', async () => {
  assert.deepEqual(after, before)
  assert.deepEqual((await db.prepare('PRAGMA foreign_key_check').all()).results, [])
  for (const table of [
    'user_medications',
    'medicine_strength_revisions',
    'daily_schedules',
    'dose_records',
    'dose_corrections',
    'unscheduled_doses',
    'medicine_edits',
    'medicine_archives',
    'medicine_restores',
    'medicine_deletions',
  ]) {
    assert.ok((before[table] as unknown[]).length > 0, `${table} must have migration coverage`)
  }
  await assert.rejects(
    () =>
      db
        .prepare('UPDATE user_medications SET unit=? WHERE owner_id=?')
        .bind('liquid', migrationOwner)
        .run(),
    /medicine_unit_locked/,
  )
  await assert.rejects(
    () => request('medicines', { operation: 'save', medicine: deletedMedicine }, migrationOwner),
    /409/,
  )
  const m = medicine('capsule')
  const result = await request('medicines', { operation: 'save', medicine: m }, migrationOwner)
  assert.equal(result.medicines[0].currentStrengthRevisionId, m.id)
  // The CHECK is forward compatible, while Worker acceptance remains policy-controlled.
  for (const unit of ['inhaler', 'drops']) {
    await db
      .prepare('INSERT INTO user_medications(owner_id,id,label,unit) VALUES(?,?,?,?)')
      .bind(migrationOwner, randomUUID(), 'Future Type', unit)
      .run()
  }
  await assert.rejects(
    () =>
      db
        .prepare('UPDATE unscheduled_doses SET quantity=0 WHERE owner_id=?')
        .bind(migrationOwner)
        .run(),
    /CHECK/,
  )
  await assert.rejects(
    () =>
      db
        .prepare('UPDATE unscheduled_doses SET quantity=-0.1 WHERE owner_id=?')
        .bind(migrationOwner)
        .run(),
    /CHECK/,
  )
})

async function fixture() {
  const ownerId = `google:${randomUUID()}`
  const m = medicine()
  const send = (path: string, command: object, owner = ownerId) => request(path, command, owner)
  const saved = await send('medicines', { operation: 'save', medicine: m })
  return { m, ownerId, send, saved }
}

function clock(medicineId: string, quantity = 0.1) {
  return {
    id: randomUUID(),
    medicineId,
    startDate: '2026-11-16',
    times: [{ time: '16:00', quantity }],
  }
}

test('Liquid Medicine creation retries retain the receipt and first use permanently locks the Quantity unit', async () => {
  for (const firstUse of ['schedule', 'dose']) {
    const f = await fixture()
    assert.equal(f.saved.medicines[0].unit, 'liquid')
    assert.equal(f.saved.medicines[0].strengthRevisions instanceof Array, true)
    const correction = {
      actionId: randomUUID(),
      medicineId: f.m.id,
      expectedRevision: 0,
      strengthRevisionId: f.m.id,
      label: 'Corrected Liquid',
      strength: '500 mg/5 ml',
      unit: 'liquid',
    }
    await f.send('medicines', { operation: 'correctDetails', correction })
    assert.deepEqual(await f.send('medicines', { operation: 'save', medicine: f.m }), f.saved)
    await assert.rejects(
      () => f.send('medicines', { operation: 'save', medicine: { ...f.m, strength: null } }),
      /409/,
    )
    if (firstUse === 'schedule')
      await f.send('schedules', { operation: 'save', schedule: clock(f.m.id) })
    else
      await f.send('schedules', {
        operation: 'saveUnscheduled',
        dose: {
          actionId: randomUUID(),
          medicineId: f.m.id,
          takenAt: now.toISOString(),
          quantity: 0.1,
        },
      })
    await assert.rejects(
      () =>
        f.send('medicines', {
          operation: 'correctDetails',
          correction: {
            ...correction,
            actionId: randomUUID(),
            expectedRevision: 1,
            unit: 'tablet',
          },
        }),
      /400/,
    )
    await assert.rejects(
      () =>
        db
          .prepare('UPDATE user_medications SET unit=? WHERE owner_id=? AND id=?')
          .bind('tablet', f.ownerId, f.m.id)
          .run(),
      /medicine_unit_locked/,
    )
    assert.deepEqual(await f.send('medicines', { operation: 'save', medicine: f.m }), f.saved)
    await assert.rejects(
      () =>
        f.send(
          'schedules',
          { operation: 'save', schedule: clock(f.m.id) },
          'google:other-liquid-owner',
        ),
      /400/,
    )
  }
})

test('Liquid Clock and Interval Schedule versions keep tenths and reject off-grid, zero and unsafe amounts', async () => {
  for (const intervalHours of [undefined, 6]) {
    const f = await fixture()
    const initial = { ...clock(f.m.id, 0.3), intervalHours }
    for (const quantity of [0.05, 1.25, 0, -0.1, 900719925474100]) {
      await assert.rejects(
        () =>
          f.send('schedules', {
            operation: 'save',
            schedule: { ...initial, times: [{ time: '16:00', quantity }] },
          }),
        /400/,
      )
    }
    const saved = await f.send('schedules', { operation: 'save', schedule: initial })
    assert.deepEqual(saved.schedules[0].times, [{ time: '16:00', quantity: 0.3 }])
    assert.deepEqual(await f.send('schedules', { operation: 'save', schedule: initial }), saved)
    const edit = {
      id: randomUUID(),
      basedOnId: initial.id,
      endDate: null,
      intervalHours,
      ...(intervalHours ? { anchorDate: '2026-11-16' } : {}),
      times: [{ time: '17:00', quantity: 0.1 }],
    }
    for (const quantity of [0.05, 1.25, 0, 900719925474100]) {
      await assert.rejects(
        () =>
          f.send('schedules', {
            operation: 'edit',
            edit: { ...edit, times: [{ time: '17:00', quantity }] },
          }),
        /400/,
      )
    }
    const changed = await f.send('schedules', { operation: 'edit', edit })
    assert.deepEqual(changed.schedules[0].times, [{ time: '17:00', quantity: 0.1 }])
    assert.deepEqual(await f.send('schedules', { operation: 'edit', edit }), changed)
    const read = await f.send('schedules', { operation: 'listOutcomes', date: '2026-11-16' })
    assert.deepEqual(read.schedules.find((s) => s.id === initial.id)?.times, [
      { time: '16:00', quantity: 0.3 },
    ])
    assert.deepEqual(read.schedules.find((s) => s.id === edit.id)?.times, [
      { time: '17:00', quantity: 0.1 },
    ])
  }
})

test('Liquid scheduled Taken and correction revisions retain decimal amounts and exact retry receipts', async () => {
  const f = await fixture()
  const schedule = clock(f.m.id)
  await f.send('schedules', { operation: 'save', schedule })
  const record = {
    scheduleId: schedule.id,
    dueAt: '2026-11-16T13:00:00.000Z',
    takenAt: now.toISOString(),
    quantity: 0.3,
  }
  for (const quantity of [0.05, 1.25, 0, 900719925474100]) {
    await assert.rejects(
      () => f.send('schedules', { operation: 'recordTaken', record: { ...record, quantity } }),
      /400/,
    )
  }
  const saved = await f.send('schedules', { operation: 'recordTaken', record })
  assert.equal(saved.records[0].quantity, 0.3)
  assert.equal(saved.records[0].unit, 'liquid')
  assert.deepEqual(await f.send('schedules', { operation: 'recordTaken', record }), saved)
  const correction = {
    ...record,
    actionId: randomUUID(),
    expectedRevision: 0,
    expectedOutcome: 'Taken',
    outcome: 'Taken',
    quantity: 1.5,
  }
  for (const quantity of [0.05, 1.25, 0, 900719925474100]) {
    await assert.rejects(
      () =>
        f.send('schedules', {
          operation: 'correctOutcome',
          correction: { ...correction, quantity },
        }),
      /400/,
    )
  }
  const changed = await f.send('schedules', { operation: 'correctOutcome', correction })
  assert.equal(changed.records[0].quantity, 1.5)
  assert.equal(changed.records[0].revision, 1)
  await f.send('schedules', {
    operation: 'correctOutcome',
    correction: { ...correction, actionId: randomUUID(), expectedRevision: 1, quantity: 0.1 },
  })
  assert.equal(
    (await f.send('schedules', { operation: 'listOutcomes', date: '2026-11-16' })).records[0]
      .quantity,
    0.1,
  )
  assert.deepEqual(await f.send('schedules', { operation: 'correctOutcome', correction }), changed)
  await assert.rejects(
    () =>
      f.send('schedules', {
        operation: 'correctOutcome',
        correction: { ...correction, actionId: randomUUID() },
      }),
    /409/,
  )
  await assert.rejects(
    () =>
      f.send('schedules', { operation: 'correctOutcome', correction }, 'google:other-liquid-owner'),
    /400/,
  )
  const read = await f.send('schedules', { operation: 'listOutcomes', date: '2026-11-16' })
  assert.equal(read.records[0].quantity, 0.1)
  assert.equal(read.records[0].revision, 2)
})

test('Liquid Unscheduled doses and changes preserve tenths, strength snapshots, revisions and exact action retries', async () => {
  const f = await fixture()
  const dose = {
    actionId: randomUUID(),
    medicineId: f.m.id,
    takenAt: now.toISOString(),
    quantity: 0.3,
  }
  for (const quantity of [0.05, 1.25, 0, 900719925474100]) {
    await assert.rejects(
      () => f.send('schedules', { operation: 'saveUnscheduled', dose: { ...dose, quantity } }),
      /400/,
    )
  }
  const saved = await f.send('schedules', { operation: 'saveUnscheduled', dose })
  assert.equal(saved.unscheduledDoses[0].quantity, 0.3)
  assert.equal(saved.unscheduledDoses[0].strengthRevisionId, f.m.id)
  assert.equal(saved.unscheduledDoses[0].strength, '250 mg/5 ml')
  assert.equal(saved.unscheduledDoses[0].unit, 'liquid')
  const change = {
    actionId: randomUUID(),
    doseId: saved.unscheduledDoses[0].id,
    expectedRevision: 0,
    removed: false,
    takenAt: dose.takenAt,
    quantity: 1.5,
  }
  for (const quantity of [0.05, 1.25, 0, 900719925474100]) {
    await assert.rejects(
      () =>
        f.send('schedules', { operation: 'changeUnscheduled', change: { ...change, quantity } }),
      /400/,
    )
  }
  const changed = await f.send('schedules', { operation: 'changeUnscheduled', change })
  assert.equal(changed.unscheduledDoses[0].quantity, 1.5)
  assert.equal(changed.unscheduledDoses[0].revision, 1)
  await f.send('schedules', {
    operation: 'changeUnscheduled',
    change: { ...change, actionId: randomUUID(), expectedRevision: 1, quantity: 0.1 },
  })
  assert.deepEqual(await f.send('schedules', { operation: 'saveUnscheduled', dose }), saved)
  assert.deepEqual(await f.send('schedules', { operation: 'changeUnscheduled', change }), changed)
  await assert.rejects(
    () =>
      f.send('schedules', {
        operation: 'changeUnscheduled',
        change: { ...change, actionId: randomUUID() },
      }),
    /409/,
  )
  await assert.rejects(
    () =>
      f.send('schedules', { operation: 'changeUnscheduled', change }, 'google:other-liquid-owner'),
    /400/,
  )
  const read = await f.send('schedules', { operation: 'listOutcomes', date: '2026-11-16' })
  assert.equal(read.unscheduledDoses[0].quantity, 0.1)
  assert.equal(read.unscheduledDoses[0].revision, 2)
})
