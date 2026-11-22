import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { afterEach, test } from 'vitest'
import { createFcmProvider, fcmTokenUrl } from '../worker/fcm'
import { createWorker } from '../worker/index'
import { runRefillPushes, type RefillProvider } from '../worker/refill-pushes'
import { clearD1Database } from './helpers/d1-migrations.mjs'
import {
  readLowStockEpisode,
  runtime,
  secret,
  startWorkerRuntime,
} from './helpers/medicine-storage-runtime'

startWorkerRuntime()
const now = new Date('2026-11-21T08:00:00.000Z')

afterEach(async () => clearD1Database(await runtime.getD1Database('DB')))

async function fixture(clock: () => Date = () => now) {
  const db = await runtime.getD1Database('DB')
  const ownerId = `google:${randomUUID()}`
  const medicineId = randomUUID()
  const worker = createWorker(clock)
  const env = { DB: db, MEDICINES_WORKER_SECRET: secret }
  const command = async (path: string, data: object) => {
    const response = await worker.fetch(
      new Request(`http://worker/${path}`, {
        method: 'POST',
        headers: { authorization: `Bearer ${secret}` },
        body: JSON.stringify({ ownerId, ...data }),
      }),
      env,
    )
    assert.equal(response.status, 200, await response.text())
  }
  await command('medicines', {
    operation: 'save',
    medicine: {
      id: medicineId,
      label: 'Original label',
      strength: '10 mg',
      unit: 'tablet',
      startingCount: 2,
    },
  })
  await command('medicines', {
    operation: 'stockThreshold',
    stock: {
      actionId: randomUUID(),
      medicineId,
      expectedRevision: 0,
      unit: 'tablet',
      threshold: 5,
    },
  })
  const episode = await readLowStockEpisode(ownerId, medicineId)
  assert.equal(episode?.pushEligible, 1)
  const execute = (sql: string, ...values: string[]) =>
    db
      .prepare(sql)
      .bind(...values)
      .run()
  return {
    env,
    quietHours: (quietHours: boolean) =>
      command('quiet-hours', { operation: 'set', change: { actionId: randomUUID(), quietHours } }),
    currentEpisode: () => readLowStockEpisode(ownerId, medicineId),
    correctCount: (count: number, expectedRevision: number) =>
      command('medicines', {
        operation: 'stockCorrection',
        stock: { actionId: randomUUID(), medicineId, expectedRevision, unit: 'tablet', count },
      }),
    episodeId: episode.id,
    run: (provider: RefillProvider) => runRefillPushes(db, provider, clock),
    register: (id: string, token = id) =>
      execute(
        'INSERT INTO device_registrations VALUES (?, ?, ?, ?)',
        id,
        ownerId,
        token,
        clock().toISOString(),
      ),
    remove: (id: string) =>
      execute('DELETE FROM device_registrations WHERE installation_id = ?', id),
    updateMedicine: (set: string) =>
      execute(
        `UPDATE user_medications SET ${set} WHERE owner_id = ? AND id = ?`,
        ownerId,
        medicineId,
      ),
    enableNames: () =>
      execute(
        'INSERT INTO account_preferences (owner_id, updated_at, medication_names) VALUES (?, ?, 1)',
        ownerId,
        clock().toISOString(),
      ),
    attempts: async () =>
      (
        await db
          .prepare('SELECT * FROM refill_delivery_attempts WHERE episode_id = ?')
          .bind(episode.id)
          .all()
      ).results,
  }
}

test('The first eligible check freezes owner targets, even if empty, and skips revoked registrations', async () => {
  const owner = await fixture()
  const empty = await fixture()
  await owner.register('first')
  await owner.register('removed')
  const tokens: string[] = []
  await owner.run({
    async submitRefill(begin) {
      await owner.remove('removed')
      // Turning the same installation back on creates a later Device registration.
      await owner.register('removed', 'replacement')
      const message = await begin()
      if (!message) return
      tokens.push(message.token)
      return 'accepted'
    },
  })
  await empty.register('late-empty')
  await owner.register('late-owner')
  await owner.run({
    async submitRefill(begin) {
      const message = await begin()
      if (!message) return
      tokens.push(message.token)
      return 'accepted'
    },
  })
  assert.deepEqual(tokens, ['first'])
  assert.equal((await owner.attempts()).length, 1)
  assert.deepEqual(await empty.attempts(), [])
})

test('Competing runs and interruption preserve an indeterminate attempt while a known failure can retry', async () => {
  const f = await fixture()
  await f.register('ambiguous')
  await f.register('retry')
  const sends: string[] = []
  const provider: RefillProvider = {
    async submitRefill(begin) {
      const message = await begin()
      if (!message) return
      sends.push(message.token)
      if (message.token === 'ambiguous') throw new Error('provider interrupted')
      return 'retryable'
    },
  }
  const runs = await Promise.allSettled([f.run(provider), f.run(provider)])
  assert.equal(runs.filter(({ status }) => status === 'rejected').length, 1)
  await f.run({
    async submitRefill(begin) {
      const message = await begin()
      if (!message) return
      sends.push(message.token)
      return 'accepted'
    },
  })
  assert.deepEqual(sends.toSorted(), ['ambiguous', 'retry', 'retry'])
  assert.equal((await f.attempts()).length, 3)
})

test('Changes to active Medicine, tracking, saved Stock, current episode or budget suppress a stale claim', async () => {
  const cases = [
    'archived_at = CURRENT_TIMESTAMP',
    'stock_count = NULL',
    'stock_count = 5',
    'stock_count = 5',
    null,
  ]
  const fixtures = await Promise.all(cases.map(() => fixture()))
  await Promise.all(fixtures.map((f, index) => f.register(`stale-${index}`)))
  let changed = false
  await fixtures[0].run({
    async submitRefill(begin) {
      if (!changed) {
        changed = true
        await Promise.all(
          cases.map(async (set, index) => {
            const f = fixtures[index]
            if (set) await f.updateMedicine(set)
            else
              await f.env.DB.prepare('UPDATE low_stock_episodes SET push_eligible = 0 WHERE id = ?')
                .bind(f.episodeId)
                .run()
            if (index === 3) await f.updateMedicine('stock_count = 2')
          }),
        )
      }
      assert.equal(await begin(), null)
      return undefined
    },
  })
  assert.equal(changed, true)
  for (const f of fixtures) assert.deepEqual(await f.attempts(), [])
})

test('The FCM request uses current Medication names and labels while attempts store neither labels nor tokens', async () => {
  const generic = await fixture()
  const named = await fixture()
  await generic.register('generic', 'secret-generic-token')
  await named.register('named', 'secret-named-token')
  const keys = await crypto.subtle.generateKey(
    {
      name: 'RSASSA-PKCS1-v1_5',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    true,
    ['sign', 'verify'],
  )
  const privateKey = Buffer.from(await crypto.subtle.exportKey('pkcs8', keys.privateKey)).toString(
    'base64',
  )
  const requests: { message: { token: string; notification: object; data: object } }[] = []
  let namedAttempts = 0
  const provider = createFcmProvider(
    { projectId: 'test', clientEmail: 'test@example.com', privateKey },
    {
      fetch: async (url, init) => {
        if (url === fcmTokenUrl) {
          await named.enableNames()
          await named.updateMedicine("label = 'Renamed Medicine'")
          return Response.json({ access_token: 'access', expires_in: 3600 })
        }
        const request = JSON.parse(String(init?.body))
        requests.push(request)
        if (request.message.token === 'secret-generic-token') throw new Error('connection lost')
        if (++namedAttempts === 1) return new Response(null, { status: 429 })
        return Response.json({})
      },
    },
  )
  await generic.run(provider)
  await generic.run(provider)
  assert.equal(requests.length, 3)
  assert.equal(namedAttempts, 2)
  const genericRequest = requests.find(({ message }) => message.token === 'secret-generic-token')
  assert.ok(genericRequest)
  assert.deepEqual(genericRequest.message.notification, { title: 'Check your stock' })
  assert.deepEqual(genericRequest.message.data, { link: '/medications' })
  assert.doesNotMatch(JSON.stringify(genericRequest), /Original label|Renamed Medicine|10 mg/)
  const namedRequest = requests.find(({ message }) => message.token === 'secret-named-token')
  assert.ok(namedRequest)
  assert.deepEqual(namedRequest.message.notification, {
    title: 'Check stock for Renamed Medicine',
  })
  assert.deepEqual(namedRequest.message.data, { link: '/medications' })
  assert.doesNotMatch(
    JSON.stringify({ ...namedRequest.message, notification: undefined }),
    /Renamed Medicine/,
  )
  assert.doesNotMatch(JSON.stringify(namedRequest), /Original label|10 mg|tablet/)
  const attempts = [...(await generic.attempts()), ...(await named.attempts())]
  assert.equal(attempts.length, 3)
  assert.doesNotMatch(JSON.stringify(attempts), /Original label|Renamed Medicine|secret-.*-token/)
})

function scheduler(f: Awaited<ReturnType<typeof fixture>>) {
  let time = now
  const sent: string[] = []
  let beforeSubmission = async () => {}
  const provider: RefillProvider = {
    async submitRefill(begin) {
      await beforeSubmission()
      const message = await begin()
      if (!message) return
      sent.push(message.token)
      return 'accepted'
    },
  }
  const worker = createWorker(
    () => time,
    () => ({ ...provider, submit: async () => ({ outcome: 'accepted' }) }),
  )
  const env = { ...f.env, SCHEDULER_SECRET: 'synthetic-scheduler-secret-at-least-32-characters' }
  return {
    sent,
    clock: () => time,
    beforeSubmission: (hook: () => Promise<void>) => (beforeSubmission = hook),
    at: (instant: string) => (time = new Date(instant)),
    cron: () => worker.scheduled(undefined, env),
    command: async () => {
      const response = await worker.fetch(
        new Request('http://worker/due-reminders', {
          method: 'POST',
          headers: { authorization: `Bearer ${env.SCHEDULER_SECRET}` },
          body: '{}',
        }),
        env,
      )
      assert.equal(response.status, 200, await response.text())
    },
  }
}

test('Overlapping first scheduler runs exclude prelaunch low episodes and preserve later budgets', async () => {
  const f = await fixture()
  await f.register('prelaunch')
  const run = scheduler(f)
  await Promise.all([run.cron(), run.command()])
  assert.deepEqual(run.sent, [])
  assert.equal((await f.currentEpisode())?.id, f.episodeId)
  assert.equal((await f.currentEpisode())?.pushEligible, 0)

  await f.correctCount(5, 1)
  await f.correctCount(2, 2)
  assert.equal((await f.currentEpisode())?.pushEligible, 1)
  const restarted = scheduler(f)
  await restarted.command()
  await run.cron()
  assert.deepEqual(restarted.sent, ['prelaunch'])
  assert.deepEqual(run.sent, [])
})

test('Both scheduler paths defer target selection and recheck Quiet hours before submission', async () => {
  const run = scheduler(await fixture())
  await run.cron()
  const morning = await fixture(run.clock)
  const changed = await fixture(run.clock)
  await Promise.all([morning.quietHours(true), changed.quietHours(true)])
  await morning.register('old-morning')
  await changed.register('changed')

  run.at('2026-11-21T20:00:00.000Z') // 23:00 in Istanbul
  await run.cron()
  run.at('2026-11-22T04:59:00.000Z') // 07:59
  await run.command()
  assert.deepEqual(run.sent, [])

  await morning.remove('old-morning')
  await morning.register('morning')
  await changed.quietHours(false)
  let reachedSubmission = false
  run.beforeSubmission(async () => {
    reachedSubmission = true
    await changed.quietHours(true)
  })
  await run.command()
  assert.equal(reachedSubmission, true)
  assert.deepEqual(run.sent, [])

  run.beforeSubmission(async () => {})
  await changed.quietHours(false)
  await run.cron()
  assert.deepEqual(run.sent, ['changed'])

  run.at('2026-11-22T05:00:00.000Z') // 08:00
  await run.command()
  assert.deepEqual(run.sent, ['changed', 'morning'])

  // After a missed 08:00 check, a pending episode can still be submitted on recovery.
  run.at('2026-11-22T20:30:00.000Z')
  const recovery = await fixture(run.clock)
  await recovery.quietHours(true)
  await recovery.register('recovery')
  await run.cron()
  run.at('2026-11-23T07:15:00.000Z')
  await run.command()
  assert.deepEqual(run.sent, ['changed', 'morning', 'recovery'])
})

test('At 08:00, equality leaves only the replacement episode eligible, and submission spends it', async () => {
  const run = scheduler(await fixture())
  await run.cron()
  const canceled = await fixture(run.clock)
  const replaced = await fixture(run.clock)
  await Promise.all([canceled.quietHours(true), replaced.quietHours(true)])
  await Promise.all([canceled.register('canceled'), replaced.register('replaced')])

  run.at('2026-11-21T20:00:00.000Z')
  await run.command()
  await Promise.all([canceled.correctCount(5, 1), replaced.correctCount(5, 1)])
  assert.equal(await canceled.currentEpisode(), null)
  assert.equal(await replaced.currentEpisode(), null)
  await replaced.correctCount(2, 2)
  const current = await replaced.currentEpisode()
  assert.ok(current)
  assert.notEqual(current.id, replaced.episodeId)

  run.at('2026-11-22T05:00:00.000Z')
  await run.cron()
  await run.command()
  assert.deepEqual(run.sent, ['replaced'])
  assert.deepEqual(await canceled.attempts(), [])
  assert.deepEqual(await replaced.attempts(), [])
})
