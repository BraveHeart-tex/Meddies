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
