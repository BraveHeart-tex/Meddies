export type CatalogRow = {
  gtin: string
  original_name: string
  name: string | null
  strength: string | null
  type: string | null
  status: string
}

export declare const catalogCsv: string
export declare const catalogHeader: string[]
export declare const catalogTypes: string[]
export declare const catalogStatuses: string[]
export declare const statementBudget: number

export function parseCatalog(text: string): { rows: CatalogRow[]; errors: string[] }
export function diffCatalogs(
  previous: CatalogRow[],
  next: CatalogRow[],
): { added: number; removed: number; changed: number }
export function catalogMigrationSql(rows: CatalogRow[], source?: string): string
export function catalogMigrationName(existing: string[], date: string): string
