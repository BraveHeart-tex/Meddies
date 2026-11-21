import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'vitest'
import { call, runtime, startWorkerRuntime } from './helpers/medicine-storage-runtime'

startWorkerRuntime()

test('corrupted stored Medicine records and retry receipts answer unavailable rather than validation', async () => {
  const ownerId = `google:${randomUUID()}`
  const medicine = { id: randomUUID(), label: 'Example', strength: null, unit: 'tablet' }
  const save = { operation: 'save', ownerId, medicine }
  assert.equal((await call(save)).status, 200)
  const db = await runtime.getD1Database('DB')
  const unavailable = async (command: object) => {
    const response = await call({ ownerId, ...command })
    assert.equal(response.status, 503)
    assert.deepEqual(await response.json(), { error: 'unavailable' })
  }
  await db
    .prepare('UPDATE user_medications SET archived_at=? WHERE owner_id=? AND id=?')
    .bind('invalid', ownerId, medicine.id)
    .run()
  await unavailable({ operation: 'list' })
  await db
    .prepare(
      'UPDATE user_medications SET archived_at=NULL,creation_result=? WHERE owner_id=? AND id=?',
    )
    .bind('{}', ownerId, medicine.id)
    .run()
  await unavailable(save)
  const deletion = { actionId: randomUUID(), medicineId: medicine.id, expectedRevision: 0 }
  assert.equal((await call({ operation: 'delete', ownerId, deletion })).status, 200)
  await db
    .prepare('UPDATE medicine_deletions SET result=? WHERE owner_id=? AND action_id=?')
    .bind('{}', ownerId, deletion.actionId)
    .run()
  await unavailable({ operation: 'delete', deletion })
})
