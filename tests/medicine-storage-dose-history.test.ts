import assert from 'node:assert/strict'
import { randomBytes, randomUUID } from 'node:crypto'
import { beforeAll, test, vi } from 'vitest'
import { createWorker } from '../worker/index'
import { GET } from '../src/app/api/dose-history/route'
import { scheduledInstant as at } from '../src/features/schedules/occurrences'
import { startWorkerRuntime, runtime, secret } from './helpers/medicine-storage-runtime'
import { installSyntheticWorker } from './helpers/synthetic-worker'

// Dose history on real D1, through the API route, server wiring and Worker (#386). Fixtures write
// through Worker commands with a moving clock, so doses carry real strength snapshots.
const session = vi.hoisted(() => ({ id: 'google:history-a' as string | null }))
vi.mock('server-only', () => ({}))
vi.mock('@/features/auth/server', () => ({
  requireUser: async () => {
    if (!session.id) throw new Error('synthetic unauthenticated session')
    return { id: session.id }
  },
}))
startWorkerRuntime()
installSyntheticWorker()

let now = new Date('2026-11-01T06:00:00.000Z')
let worker: ReturnType<typeof createWorker>
let env: { DB: D1Database; MEDICINES_WORKER_SECRET: string }
beforeAll(async () => {
  env = { DB: await runtime.getD1Database('DB'), MEDICINES_WORKER_SECRET: secret }
  process.env.MEDICINES_WORKER_SECRET = secret
  worker = createWorker(() => now)
  globalThis.fetch = async (url, init) =>
    worker.fetch(
      new Request(url as URL, { method: init!.method, headers: init!.headers, body: init!.body }),
      env,
    )
})

const owner = () => `google:${randomBytes(8).toString('hex')}`
const setNow = (instant: string) => {
  now = new Date(instant)
}
async function command(ownerId: string, path: string, body: Record<string, unknown>) {
  const response = await worker.fetch(
    new Request(`http://worker/${path}`, {
      method: 'POST',
      headers: { authorization: `Bearer ${secret}` },
      body: JSON.stringify({ ownerId, ...body }),
    }),
    env,
  )
  assert.equal(response.status, 200, `${path} ${String(body.operation)}`)
  return (await response.json()) as Record<string, unknown>
}
async function saveMedicine(ownerId: string, strength: string) {
  const id = randomUUID()
  await command(ownerId, 'medicines', {
    operation: 'save',
    medicine: { id, label: 'Example', strength, unit: 'tablet' },
  })
  return id
}
async function revision(ownerId: string, medicineId: string) {
  const { medicines } = (await command(ownerId, 'medicines', { operation: 'list' })) as {
    medicines: { id: string; revision: number }[]
  }
  return medicines.find((item) => item.id === medicineId)!.revision
}
async function saveUnscheduled(ownerId: string, medicineId: string, takenAt: string, quantity = 1) {
  const actionId = randomUUID()
  await command(ownerId, 'schedules', {
    operation: 'saveUnscheduled',
    dose: { actionId, medicineId, takenAt, quantity },
  })
  return actionId
}
async function read(ownerId: string | null, medicineId: string, before?: string) {
  session.id = ownerId
  const query = `medicineId=${medicineId}${before ? `&before=${before}` : ''}`
  const response = await GET(new Request(`http://app.test/api/dose-history?${query}`))
  return { status: response.status, body: await response.json() }
}

test('Dose history lists latest Taken doses by Istanbul intake day with totals per saved strength', async () => {
  const a = owner()
  const medicineId = await saveMedicine(a, '500 mg')
  const [s1, s2] = [randomUUID(), randomUUID()]
  const times = [
    { time: '08:00', quantity: 1 },
    { time: '23:00', quantity: 1 },
  ]
  setNow(at('2026-11-01', '09:00'))
  await command(a, 'schedules', {
    operation: 'save',
    schedule: { id: s1, medicineId, startDate: '2026-11-02', times },
  })
  const taken = async (scheduleId: string, dueAt: string, takenAt: string, quantity = 1) => {
    setNow(new Date(Date.parse(takenAt) + 60_000).toISOString())
    await command(a, 'schedules', {
      operation: 'recordTaken',
      record: { scheduleId, dueAt, takenAt, quantity },
    })
  }
  await taken(s1, at('2026-11-02', '08:00'), at('2026-11-02', '08:05'))
  await taken(s1, at('2026-11-03', '08:00'), at('2026-11-03', '08:05'))
  // A second Schedule version from Nov 3 12:00 owns the later occurrences.
  setNow(at('2026-11-03', '12:00'))
  await command(a, 'schedules', {
    operation: 'edit',
    edit: { id: s2, basedOnId: s1, endDate: null, times },
  })
  // Late intake: the Nov 3 23:00 dose taken at Nov 4 00:30 counts on Nov 4.
  await taken(s2, at('2026-11-03', '23:00'), at('2026-11-04', '00:30'), 2)
  setNow(at('2026-11-04', '08:10'))
  await command(a, 'schedules', {
    operation: 'recordSkipped',
    record: { scheduleId: s2, dueAt: at('2026-11-04', '08:00') },
  })
  setNow(at('2026-11-04', '12:05'))
  await command(a, 'medicines', {
    operation: 'changeStrength',
    change: {
      actionId: randomUUID(),
      medicineId,
      expectedRevision: await revision(a, medicineId),
      strength: '1000 mg',
      effectiveAt: at('2026-11-04', '12:00'),
      timeZone: 'Europe/Istanbul',
    },
  })
  setNow(at('2026-11-04', '14:15'))
  const nov4Unscheduled = await saveUnscheduled(a, medicineId, at('2026-11-04', '14:10'))

  // Corrections: a moved intake time and quantity, a correction to Skipped, a removed and a
  // changed Unscheduled dose.
  await taken(s2, at('2026-11-05', '08:00'), at('2026-11-05', '08:05'))
  setNow(at('2026-11-05', '12:05'))
  const removed = await saveUnscheduled(a, medicineId, at('2026-11-05', '12:00'))
  setNow(at('2026-11-05', '15:05'))
  const changed = await saveUnscheduled(a, medicineId, at('2026-11-05', '15:00'))
  await taken(s2, at('2026-11-05', '23:00'), at('2026-11-05', '23:05'))
  setNow(at('2026-11-06', '00:30'))
  const correct = (correction: Record<string, unknown>) =>
    command(a, 'schedules', {
      operation: 'correctOutcome',
      correction: { actionId: randomUUID(), expectedRevision: 0, ...correction },
    })
  await correct({
    scheduleId: s2,
    dueAt: at('2026-11-05', '08:00'),
    expectedOutcome: 'Taken',
    outcome: 'Taken',
    takenAt: at('2026-11-06', '00:20'),
    quantity: 2,
  })
  await correct({
    scheduleId: s2,
    dueAt: at('2026-11-05', '23:00'),
    expectedOutcome: 'Taken',
    outcome: 'Skipped',
  })
  const change = (doseId: string, fields: Record<string, unknown>) =>
    command(a, 'schedules', {
      operation: 'changeUnscheduled',
      change: { actionId: randomUUID(), doseId, expectedRevision: 0, ...fields },
    })
  await change(removed, { removed: true })
  await change(changed, { removed: false, takenAt: at('2026-11-05', '15:00'), quantity: 0.5 })

  setNow(at('2026-11-06', '09:00'))
  const scheduled = (
    scheduleId: string,
    due: [string, string],
    takenAt: string,
    quantity: number,
    strength: string,
    revision = 0,
  ) => ({
    kind: 'scheduled',
    scheduleId,
    dueAt: at(...due),
    historyDate: due[0],
    takenAt,
    quantity,
    unit: 'tablet',
    strength,
    revision,
  })
  const unscheduled = (id: string, takenAt: string, quantity: number, revision = 0) => ({
    kind: 'unscheduled',
    id,
    historyDate: takenAt.slice(0, 10),
    takenAt,
    quantity,
    unit: 'tablet',
    strength: '1000 mg',
    revision,
  })
  const tablets = (quantity: number, strength: string) => ({ quantity, unit: 'tablet', strength })
  const movedDose = scheduled(
    s2,
    ['2026-11-05', '08:00'],
    at('2026-11-06', '00:20'),
    2,
    '1000 mg',
    1,
  )
  assert.deepEqual(await read(a, medicineId), {
    status: 200,
    body: {
      medicineId,
      days: [
        { date: '2026-11-06', doses: [movedDose], totals: [tablets(2, '1000 mg')] },
        {
          date: '2026-11-05',
          doses: [unscheduled(changed, at('2026-11-05', '15:00'), 0.5, 1)],
          totals: [tablets(0.5, '1000 mg')],
        },
        {
          date: '2026-11-04',
          doses: [
            unscheduled(nov4Unscheduled, at('2026-11-04', '14:10'), 1),
            scheduled(s2, ['2026-11-03', '23:00'], at('2026-11-04', '00:30'), 2, '500 mg'),
          ],
          totals: [tablets(1, '1000 mg'), tablets(2, '500 mg')],
        },
        {
          date: '2026-11-03',
          doses: [scheduled(s1, ['2026-11-03', '08:00'], at('2026-11-03', '08:05'), 1, '500 mg')],
          totals: [tablets(1, '500 mg')],
        },
        {
          date: '2026-11-02',
          doses: [scheduled(s1, ['2026-11-02', '08:00'], at('2026-11-02', '08:05'), 1, '500 mg')],
          totals: [tablets(1, '500 mg')],
        },
      ],
      before: null,
      summary: {
        lastDose: movedDose,
        today: [tablets(2, '1000 mg')],
        last7Days: [tablets(3.5, '1000 mg'), tablets(4, '500 mg')],
        last30Days: [tablets(3.5, '1000 mg'), tablets(4, '500 mg')],
      },
    },
  })
})

test('Dose history pages whole Istanbul days back to the first Taken dose, and windows end at Istanbul midnight', async () => {
  const c = owner()
  const medicineId = await saveMedicine(c, '250 mg')
  // 33 days, Oct 15 to Nov 16, each with doses at 00:05 and 23:55 Istanbul (21:05 the previous
  // UTC day and 20:55 the same UTC day).
  const dates = Array.from({ length: 33 }, (_, index) =>
    new Date(Date.UTC(2026, 9, 15 + index)).toISOString().slice(0, 10),
  )
  for (const date of dates)
    for (const [time, quantity] of [
      ['00:05', 1],
      ['23:55', 0.5],
    ] as const) {
      setNow(new Date(Date.parse(at(date, time)) + 60_000).toISOString())
      await saveUnscheduled(c, medicineId, at(date, time), quantity)
    }
  setNow(at('2026-11-16', '23:58'))

  const pages = [await read(c, medicineId)]
  while (pages.at(-1)!.body.before) pages.push(await read(c, medicineId, pages.at(-1)!.body.before))
  assert.deepEqual(
    pages.map(({ status, body }) => [status, body.days.length, body.before]),
    [
      [200, 14, '2026-11-03'],
      [200, 14, '2026-10-20'],
      [200, 5, null],
    ],
    'each cursor is the oldest day returned; the last page ends at the first Taken dose',
  )
  const days = pages.flatMap(({ body }) => body.days) as {
    date: string
    doses: { takenAt: string }[]
    totals: unknown[]
  }[]
  assert.deepEqual(
    days.map(({ date }) => date),
    dates.toReversed(),
    'no day repeats or goes missing',
  )
  for (const day of days) {
    assert.deepEqual(
      day.doses.map(({ takenAt }) => takenAt),
      [at(day.date, '23:55'), at(day.date, '00:05')],
      `${day.date} is whole and newest first`,
    )
    assert.deepEqual(day.totals, [{ quantity: 1.5, unit: 'tablet', strength: '250 mg' }])
  }
  assert.deepEqual(
    pages.map(({ body }) => body.summary === null),
    [false, true, true],
    'only the first page carries the summary',
  )
  const { lastDose, ...windows } = pages[0].body.summary
  assert.equal(lastDose.takenAt, at('2026-11-16', '23:55'))
  const total = (quantity: number) => [{ quantity, unit: 'tablet', strength: '250 mg' }]
  // Nov 16 alone; Nov 10 to Nov 16; Oct 18 to Nov 16. A UTC-day window would count 9.5 and 44.
  assert.deepEqual(windows, { today: total(1.5), last7Days: total(10.5), last30Days: total(45) })
})

test('Dose history reads another owner or unknown medication as not found, and an Archived medicine normally', async () => {
  const [a, b] = [owner(), owner()]
  const medicineId = await saveMedicine(a, '500 mg')
  setNow(at('2026-11-10', '09:05'))
  await saveUnscheduled(a, medicineId, at('2026-11-10', '09:00'))
  const own = await read(a, medicineId)
  assert.equal(own.status, 200)
  assert.equal(own.body.days.length, 1)

  assert.deepEqual(await read(b, medicineId), { status: 404, body: { error: 'not_found' } })
  assert.deepEqual(await read(a, randomUUID()), { status: 404, body: { error: 'not_found' } })
  assert.deepEqual(await read(null, medicineId), { status: 401, body: { error: 'unauthorized' } })

  await command(a, 'medicines', {
    operation: 'archive',
    archive: {
      actionId: randomUUID(),
      medicineId,
      expectedRevision: await revision(a, medicineId),
    },
  })
  assert.deepEqual(await read(a, medicineId), own, 'an Archived medicine keeps its Dose history')
})
