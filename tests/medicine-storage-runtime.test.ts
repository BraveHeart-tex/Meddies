import assert from 'node:assert/strict'
import { test } from 'vitest'
import { runtime, startWorkerRuntime } from './helpers/medicine-storage-runtime'

startWorkerRuntime()

test('ordinary storage runtimes start with no historical fixture rows', async () => {
  const db = await runtime.getD1Database('DB')
  const { results: tables } = await db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite\\_%' ESCAPE '\\' AND name NOT LIKE '\\_cf\\_%' ESCAPE '\\'",
    )
    .all<{ name: string }>()
  assert.ok(tables.length > 0)
  for (const { name } of tables) {
    const row = await db
      .prepare(`SELECT COUNT(*) AS count FROM "${name.replaceAll('"', '""')}"`)
      .first<{ count: number }>()
    assert.equal(row?.count, 0, `${name} must start empty`)
  }
})
