// Shared real-D1 runtime for the medicine storage suites: each file calls startWorkerRuntime()
// for its own workerd and D1, so Vitest runs the files in parallel. Ordinary suites apply
// the full migration chain without fixture rows. Migration suites opt in to historical
// inputs, inserted by afterMigration against the schema at their original boundaries.
import type {
  ScheduleCommand,
  ScheduleResponse,
  SendSchedule,
} from '../../src/features/schedules/contract'
import type { Medicine } from '../../src/features/medicines/contract'
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll } from 'vitest'
import { Miniflare, convertV4MiniflareOptions } from 'miniflare'
import { createWorker } from '../../worker/index'
import { createScheduleOperations } from '../../src/features/schedules/operations'
import { applyD1Migrations } from './d1-migrations.mjs'

export let runtime: Miniflare
export const secret = 'synthetic-worker-secret-at-least-32-characters'
export const medicine: Medicine = {
  id: randomUUID(),
  label: 'Vitamin D3',
  strength: '1000 IU',
  unit: 'tablet',
}
export const legacy = {
  ownerId: 'google:legacy-migration',
  medicineId: '10000000-0000-4000-8000-000000000001',
  scheduleId: '10000000-0000-4000-8000-000000000002',
  dueAt: '2026-11-05T06:00:00.000Z',
  date: '2026-11-05',
  quantity: 0.5,
  takenAt: '2026-11-05T05:50:00.000Z',
}
export const call = (command: unknown, authorization = `Bearer ${secret}`) =>
  runtime.dispatchFetch('http://worker/medicines', {
    method: 'POST',
    headers: { authorization, 'content-type': 'application/json' },
    body: JSON.stringify(command),
  })

// Doses saved after a starting count but before 0026 count once when it applies.
export const stockBackfill = {
  ownerId: 'google:stock-backfill',
  medicineId: '10000000-0000-4000-8000-000000000020',
  scheduleId: '10000000-0000-4000-8000-000000000021',
}
async function seedStockBackfill(db: Awaited<ReturnType<Miniflare['getD1Database']>>) {
  const { ownerId, medicineId, scheduleId } = stockBackfill
  const run = (query: string, ...values: unknown[]) =>
    db
      .prepare(query)
      .bind(...values)
      .run()
  await run(
    'INSERT INTO user_medications(owner_id,id,label,strength,unit,starting_count,stock_started_at) VALUES(?,?,?,?,?,?,?)',
    ownerId,
    medicineId,
    'Backfill',
    null,
    'tablet',
    10,
    '2026-11-05T05:00:30.000Z',
  )
  await run(
    'INSERT INTO daily_schedules(owner_id,id,medicine_id,start_date,times,confirmed_at) VALUES(?,?,?,?,?,?)',
    ownerId,
    scheduleId,
    medicineId,
    legacy.date,
    '[{"time":"07:00","quantity":1},{"time":"09:00","quantity":1},{"time":"10:00","quantity":1}]',
    '2026-11-04T20:00:00.000Z',
  )
  const dose =
    'INSERT INTO dose_records(owner_id,schedule_id,due_at,taken_at,quantity,outcome) VALUES(?,?,?,?,?,?)'
  // Before the starting count: not counted. Same minute: counted.
  await run(
    dose,
    ownerId,
    scheduleId,
    '2026-11-05T04:00:00.000Z',
    '2026-11-05T04:00:00.000Z',
    1,
    'Taken',
  )
  await run(dose, ownerId, scheduleId, legacy.dueAt, '2026-11-05T05:00:00.000Z', 1, 'Taken')
  // Skipped, then corrected to Taken 0.5: the latest version counts.
  await run(
    'INSERT INTO skipped_dose_records(owner_id,schedule_id,due_at,recorded_at,outcome) VALUES(?,?,?,?,?)',
    ownerId,
    scheduleId,
    '2026-11-05T07:00:00.000Z',
    '2026-11-05T07:01:00.000Z',
    'Skipped',
  )
  await run(
    'INSERT INTO dose_corrections(owner_id,schedule_id,due_at,revision,action_id,expected_outcome,outcome,taken_at,quantity,recorded_at) VALUES(?,?,?,?,?,?,?,?,?,?)',
    ownerId,
    scheduleId,
    '2026-11-05T07:00:00.000Z',
    1,
    '10000000-0000-4000-8000-000000000022',
    'Skipped',
    'Taken',
    '2026-11-05T07:02:00.000Z',
    0.5,
    '2026-11-05T07:03:00.000Z',
  )
  // Unscheduled 2, then removed: never taken.
  const unscheduled =
    'INSERT INTO unscheduled_doses(owner_id,id,revision,action_id,medicine_id,taken_at,quantity,removed,request) VALUES(?,?,?,?,?,?,?,?,?)'
  const doseId = '10000000-0000-4000-8000-000000000023'
  await run(
    unscheduled,
    ownerId,
    doseId,
    0,
    doseId,
    medicineId,
    '2026-11-05T08:00:00.000Z',
    2,
    0,
    '{}',
  )
  await run(
    unscheduled,
    ownerId,
    doseId,
    1,
    '10000000-0000-4000-8000-000000000024',
    medicineId,
    '2026-11-05T08:00:00.000Z',
    2,
    1,
    '{}',
  )
}

type HistoricalMigration =
  | '0003_dose_records.sql'
  | '0007_interval_schedules.sql'
  | '0012_unscheduled_doses.sql'
  | '0025_stock_tracking.sql'

export function startWorkerRuntime({ history = [] }: { history?: HistoricalMigration[] } = {}) {
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
    const db = await runtime.getD1Database('DB')
    await applyD1Migrations(db, {
      async afterMigration(file) {
        if (!history.some((boundary) => boundary === file)) return
        if (file === '0025_stock_tracking.sql') await seedStockBackfill(db)
        if (file === '0012_unscheduled_doses.sql') {
          await db
            .prepare(
              'INSERT INTO user_medications(owner_id,id,label,strength,unit) VALUES(?,?,?,?,?)',
            )
            .bind(
              'google:strength-migration',
              '10000000-0000-4000-8000-000000000010',
              'Legacy strength',
              '125 mg',
              'capsule',
            )
            .run()
          await db
            .prepare('INSERT INTO unscheduled_doses VALUES(?,?,?,?,?,?,?,?,?)')
            .bind(
              'google:strength-migration',
              '10000000-0000-4000-8000-000000000011',
              0,
              '10000000-0000-4000-8000-000000000011',
              '10000000-0000-4000-8000-000000000010',
              legacy.takenAt,
              1,
              0,
              '{}',
            )
            .run()
        }
        if (file === '0012_unscheduled_doses.sql') {
          await db
            .prepare(
              'INSERT INTO daily_schedules(owner_id,id,medicine_id,start_date,times,confirmed_at) VALUES(?,?,?,?,?,?)',
            )
            .bind(
              'google:strength-migration',
              '10000000-0000-4000-8000-000000000012',
              '10000000-0000-4000-8000-000000000010',
              legacy.date,
              '[{"time":"09:00","quantity":1}]',
              '2026-11-04T20:00:00.000Z',
            )
            .run()
          await db
            .prepare(
              'INSERT INTO dose_records(owner_id,schedule_id,due_at,taken_at,quantity,outcome) VALUES(?,?,?,?,?,?)',
            )
            .bind(
              'google:strength-migration',
              '10000000-0000-4000-8000-000000000012',
              legacy.dueAt,
              legacy.takenAt,
              1,
              'Taken',
            )
            .run()
        }
        if (file === '0007_interval_schedules.sql') {
          await db
            .prepare('INSERT INTO skipped_dose_records VALUES(?,?,?,?,?)')
            .bind(
              legacy.ownerId,
              legacy.scheduleId,
              '2026-11-06T06:00:00.000Z',
              '2026-11-06T06:01:00.000Z',
              'Skipped',
            )
            .run()
          await db
            .prepare('INSERT INTO dose_corrections VALUES(?,?,?,?,?,?,?,?,?,?)')
            .bind(
              legacy.ownerId,
              legacy.scheduleId,
              '2026-11-06T06:00:00.000Z',
              1,
              '10000000-0000-4000-8000-000000000003',
              'Skipped',
              'Taken',
              '2026-11-06T06:02:00.000Z',
              1,
              '2026-11-06T06:03:00.000Z',
            )
            .run()
        }
        if (file !== '0003_dose_records.sql') return
        await db
          .prepare(
            'INSERT INTO user_medications(owner_id,id,label,strength,unit) VALUES(?,?,?,?,?)',
          )
          .bind(legacy.ownerId, legacy.medicineId, 'Legacy dose', null, 'tablet')
          .run()
        await db
          .prepare(
            'INSERT INTO daily_schedules(owner_id,id,medicine_id,start_date,times,confirmed_at) VALUES(?,?,?,?,?,?)',
          )
          .bind(
            legacy.ownerId,
            legacy.scheduleId,
            legacy.medicineId,
            legacy.date,
            '[{"time":"09:00","quantity":1}]',
            '2026-11-04T20:00:00.000Z',
          )
          .run()
        await db
          .prepare(
            'INSERT INTO dose_records(owner_id,schedule_id,due_at,taken_at,quantity,outcome) VALUES(?,?,?,?,?,?)',
          )
          .bind(
            legacy.ownerId,
            legacy.scheduleId,
            legacy.dueAt,
            legacy.takenAt,
            legacy.quantity,
            'Taken',
          )
          .run()
      },
    })
  })
  afterAll(async () => {
    await runtime?.dispose()
  })
}

export async function versionFixture() {
  let now = new Date('2026-11-02T04:00:00.000Z')
  const handler = createWorker(() => now)
  const db = await runtime.getD1Database('DB')
  const ownerId = `google:${randomUUID()}`
  const tablet = { ...medicine, id: randomUUID() }
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
    const body = await response.json()
    if (!response.ok)
      throw Object.assign(new Error((body as { error: string }).error), { status: response.status })
    return body as ScheduleResponse<C>
  }
  const operations = createScheduleOperations({
    requireUser: async () => ({ id: ownerId }),
    send,
    now: () => now,
  })
  return {
    operations,
    send,
    ownerId,
    medicineId: tablet.id,
    setNow: (value: string) => {
      now = new Date(value)
    },
  }
}
