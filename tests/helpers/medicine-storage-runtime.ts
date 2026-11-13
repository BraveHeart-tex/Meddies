// Shared real-D1 runtime for the medicine storage suites: each file calls startWorkerRuntime()
// for its own workerd and D1, so Vitest runs the files in parallel. Migrations seed legacy
// rows that the migration cases read back.
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

export function startWorkerRuntime() {
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
    medicineId: tablet.id,
    setNow: (value: string) => {
      now = new Date(value)
    },
  }
}
