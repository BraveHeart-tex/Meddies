import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { after, before, test } from 'node:test'
import { readFile } from 'node:fs/promises'
import { Miniflare, convertV4MiniflareOptions } from 'miniflare'

let runtime
const secret = 'synthetic-worker-secret-at-least-32-characters'
const medicine = { id: randomUUID(), label: 'Vitamin D3', strength: '1000 IU', unit: 'tablet' }
const call = (command, authorization = `Bearer ${secret}`) =>
  runtime.dispatchFetch('http://worker/medicines', {
    method: 'POST',
    headers: { authorization, 'content-type': 'application/json' },
    body: JSON.stringify(command),
  })
before(async () => {
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
  await db.exec(
    (await readFile('worker/migrations/0001_user_medications.sql', 'utf8')).replaceAll('\n', ' '),
  )
})
after(async () => {
  await runtime?.dispose()
})

test('real D1 save survives reload; concurrent retries have one effect and remain owner scoped', async () => {
  const command = { operation: 'save', ownerId: 'google:alice', medicine }
  const responses = await Promise.all([call(command), call(command)])
  for (const response of responses) {
    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), { medicines: [medicine] })
  }
  assert.equal((await call(command)).status, 200)
  const reload = await call({ operation: 'list', ownerId: 'google:alice' })
  assert.deepEqual(await reload.json(), { medicines: [medicine] })
  const other = await call({ operation: 'list', ownerId: 'google:bob' })
  assert.deepEqual(await other.json(), { medicines: [] })
  assert.equal(
    (await call({ ...command, medicine: { ...medicine, label: 'Changed' } })).status,
    409,
  )
  assert.equal((await call(command, 'Bearer wrong')).status, 401)
})
