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

async function fixture() {
  const db = await runtime.getD1Database('DB')
  const ownerId = `google:${randomUUID()}`
  const medicineId = randomUUID()
  const worker = createWorker(() => now)
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
    episodeId: episode.id,
    run: (provider: RefillProvider) => runRefillPushes(db, provider),
    register: (id: string, token = id) =>
      execute(
        'INSERT INTO device_registrations VALUES (?, ?, ?, ?)',
        id,
        ownerId,
        token,
        now.toISOString(),
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
        now.toISOString(),
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
  const requests: { message: { token: string; notification: object } }[] = []
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
  assert.doesNotMatch(JSON.stringify(genericRequest), /Original label|Renamed Medicine|10 mg/)
  const namedRequest = requests.find(({ message }) => message.token === 'secret-named-token')
  assert.ok(namedRequest)
  assert.match(JSON.stringify(namedRequest.message.notification), /Renamed Medicine/)
  assert.doesNotMatch(
    JSON.stringify({ ...namedRequest.message, notification: undefined }),
    /Renamed Medicine/,
  )
  assert.doesNotMatch(JSON.stringify(namedRequest), /Original label|10 mg|tablet/)
  const attempts = [...(await generic.attempts()), ...(await named.attempts())]
  assert.equal(attempts.length, 3)
  assert.doesNotMatch(JSON.stringify(attempts), /Original label|Renamed Medicine|secret-.*-token/)
})

test('The scheduled Worker leaves a pending refill push inactive', async () => {
  const f = await fixture()
  await f.register('inactive')
  const sent: unknown[] = []
  const provider = {
    async submit(message: unknown) {
      sent.push(message)
      return { outcome: 'accepted' as const }
    },
    async submitRefill(begin: () => Promise<unknown>) {
      sent.push(await begin())
      return 'accepted' as const
    },
  }
  await createWorker(
    () => now,
    () => provider,
  ).scheduled(undefined, f.env)
  assert.deepEqual(sent, [])
  assert.deepEqual(await f.attempts(), [])
  assert.equal(
    await f.env.DB.prepare('SELECT targets_selected FROM low_stock_episodes WHERE id = ?')
      .bind(f.episodeId)
      .first('targets_selected'),
    0,
  )
})
