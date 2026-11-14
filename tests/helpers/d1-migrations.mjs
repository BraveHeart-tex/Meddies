import { readFile, readdir } from 'node:fs/promises'
import { unstable_splitSqlQuery } from 'wrangler'

const directory = new URL('../../worker/migrations/', import.meta.url)

export async function applyD1Migrations(db, { afterMigration } = {}) {
  const files = (await readdir(directory, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && /^\d+.*\.sql$/.test(entry.name))
    .map((entry) => entry.name)
    .sort()

  for (const file of files) {
    const sql = await readFile(new URL(file, directory), 'utf8')
    const statements = unstable_splitSqlQuery(sql)
    if (statements.length) await db.batch(statements.map((statement) => db.prepare(statement)))
    await afterMigration?.(file)
  }
}

/**
 * Empty every table, leaving the migrated schema in place. Migrations only copy rows between
 * their own tables, so a migrated database starts empty and this restores that state.
 */
export async function clearD1Database(db) {
  const { results } = await db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite\\_%' ESCAPE '\\' AND name NOT LIKE '\\_cf\\_%' ESCAPE '\\'",
    )
    .all()
  await db.batch([
    db.prepare('PRAGMA defer_foreign_keys = ON'),
    ...results.map(({ name }) => db.prepare(`DELETE FROM "${name.replaceAll('"', '""')}"`)),
  ])
}
