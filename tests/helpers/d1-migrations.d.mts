type Database = {
  prepare(query: string): unknown
  batch(statements: unknown[]): Promise<unknown>
}

export function applyD1Migrations<T extends Database>(
  db: T,
  options?: { afterMigration?: (file: string) => unknown },
): Promise<void>

export function clearD1Database<T extends Database>(db: T): Promise<void>
