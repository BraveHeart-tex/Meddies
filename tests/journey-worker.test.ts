import { execFile } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { afterAll, beforeAll, expect, test } from 'vitest'
import { startJourneyWorker, type JourneyWorker } from './browser/journey-worker'
import { startWorkerProxy, type WorkerProxy } from './browser/worker-proxy'

// Journeys on one Playwright worker share its local Worker. Catches rows, Worker rules, the
// request log or a frozen clock leaking from one journey into the next.
let directory: string
let worker: JourneyWorker

beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), 'meddies-journey-worker-'))
  // Its own bundle, so a parallel integration run rewriting .worker-build cannot interfere.
  await promisify(execFile)('pnpm', [
    'exec',
    'wrangler',
    'deploy',
    '--config',
    'worker/wrangler.jsonc',
    '--dry-run',
    '--outdir',
    join(directory, 'worker'),
  ])
  worker = await startJourneyWorker(join(directory, 'worker'))
}, 30_000)

afterAll(async () => {
  await worker?.dispose()
  await rm(directory, { recursive: true, force: true })
})

const ownerId = 'google:journey-worker'
const medicineId = '20000000-0000-4000-8000-000000000001'
let actions = 0

async function startJourney(clock?: string) {
  const clockFile = clock ? join(directory, `clock-${actions}`) : undefined
  if (clockFile) await writeFile(clockFile, clock!)
  const db = await worker.startJourney(clockFile)
  const proxy = await startWorkerProxy(worker.url)
  const send = async (path: string, command: object) => {
    const response = await fetch(new URL(path, proxy.url), {
      method: 'POST',
      headers: { authorization: `Bearer ${worker.secret}`, 'content-type': 'application/json' },
      body: JSON.stringify({ ownerId, ...command }),
    })
    return { status: response.status, body: await response.json() }
  }
  const saveMedicine = () =>
    send('/medicines', {
      operation: 'save',
      medicine: { id: medicineId, label: 'Vitamin D3', strength: '1000 IU', unit: 'tablet' },
    })
  // The Worker accepts a dose taken up to its clock's now, and rejects later ones.
  const saveDose = async (takenAt: string) =>
    (
      await send('/schedules', {
        operation: 'saveUnscheduled',
        dose: {
          actionId: `20000000-0000-4000-8000-${String(++actions).padStart(12, '0')}`,
          medicineId,
          takenAt,
          quantity: 1,
        },
      })
    ).status
  return { db, proxy, send, saveMedicine, saveDose }
}

async function rowCounts(db: Awaited<ReturnType<JourneyWorker['startJourney']>>) {
  const { results } = await db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'",
    )
    .all<{ name: string }>()
  return Object.fromEntries(
    await Promise.all(
      results.map(async ({ name }): Promise<[string, number]> => [
        name,
        (await db.prepare(`SELECT count(*) AS n FROM "${name}"`).first<number>('n')) ?? 0,
      ]),
    ),
  )
}

const minus = (instant: string, minutes: number) =>
  new Date(Date.parse(instant) - minutes * 60_000).toISOString()

test("a second journey on the same Worker sees none of the first journey's state", async () => {
  const first = '2026-01-10T09:00:00.000Z'
  const second = '2030-06-01T09:00:00.000Z'
  const proxies: WorkerProxy[] = []
  try {
    const one = await startJourney(first)
    proxies.push(one.proxy)
    expect((await one.saveMedicine()).status).toBe(200)
    expect(await one.saveDose(minus(first, 60))).toBe(200)
    expect(await one.saveDose(minus(second, 60))).toBe(400)
    one.proxy.fail({ method: 'POST', path: '/medicines', operation: 'list' }, 503)
    one.proxy.hold({ method: 'POST', path: '/schedules' })
    const tables = await rowCounts(one.db)
    expect(Object.values(tables).some((count) => count > 0)).toBe(true)

    const two = await startJourney(second)
    proxies.push(two.proxy)
    const empty = Object.fromEntries(Object.keys(tables).map((name) => [name, 0]))
    expect(await rowCounts(two.db)).toEqual(empty)
    expect(await two.send('/medicines', { operation: 'list' })).toEqual({
      status: 200,
      body: { medicines: [] },
    })
    expect(two.proxy.requests()).toHaveLength(1)
    expect((await two.saveMedicine()).status).toBe(200)
    // Not held: the first journey's hold rule stayed with its proxy.
    expect(await two.saveDose(minus(first, 60))).toBe(400)
    expect(await two.saveDose(minus(second, 60))).toBe(200)
    expect(two.proxy.held()).toBe(0)

    // Without a clock of its own, the next journey runs on real time.
    const three = await startJourney()
    proxies.push(three.proxy)
    expect(await rowCounts(three.db)).toEqual(empty)
    expect((await three.saveMedicine()).status).toBe(200)
    expect(await three.saveDose(minus(second, 60))).toBe(400)
    expect(await three.saveDose(minus(new Date().toISOString(), 1))).toBe(200)
  } finally {
    await Promise.all(proxies.map((proxy) => proxy.close()))
  }
})
