type Database = {
  prepare(query: string): unknown
  batch(statements: unknown[]): Promise<unknown>
}

export declare const catalogDataMigration: RegExp

export function d1MigrationFiles(options?: { catalogData?: boolean }): Promise<string[]>

export function applyD1Migration<T extends Database>(db: T, file: string): Promise<void>

export function applyD1Migrations<T extends Database>(
  db: T,
  options?: { afterMigration?: (file: string) => unknown; catalogData?: boolean },
): Promise<void>

export function clearD1Database<T extends Database>(db: T): Promise<void>
