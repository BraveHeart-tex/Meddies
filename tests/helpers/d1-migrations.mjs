import { readFile, readdir } from 'node:fs/promises'
import { unstable_splitSqlQuery } from 'wrangler'

const directory = new URL('../../worker/migrations/', import.meta.url)

/** Catalog data migrations (`NNNN_catalog_data_<date>.sql`, #472) each hold the whole catalog. */
export const catalogDataMigration = /^\d+_catalog_data_\d{4}-\d{2}-\d{2}\.sql$/

/** Migration file names in order; catalog data migrations only when `catalogData` is set. */
export async function d1MigrationFiles({ catalogData = false } = {}) {
  return (await readdir(directory, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && /^\d+.*\.sql$/.test(entry.name))
    .map((entry) => entry.name)
    .filter((file) => catalogData || !catalogDataMigration.test(file))
    .sort()
}

export async function applyD1Migration(db, file) {
  const sql = await readFile(new URL(file, directory), 'utf8')
  const statements = unstable_splitSqlQuery(sql)
  if (statements.length) await db.batch(statements.map((statement) => db.prepare(statement)))
}

/**
 * Apply the migration chain. Catalog data migrations are skipped unless a test opts in with
 * `catalogData`, so suite time does not grow with the catalog.
 */
export async function applyD1Migrations(db, { afterMigration, catalogData = false } = {}) {
  for (const file of await d1MigrationFiles({ catalogData })) {
    await applyD1Migration(db, file)
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
