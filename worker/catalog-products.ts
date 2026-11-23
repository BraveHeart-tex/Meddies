// Catalog product lookup (#196). Catalog products are shared reference rows keyed by GTIN-14,
// with no foreign keys to or from personal tables, so the session-gated lookup reads no owner
// data and a catalog refresh never touches a Medicine. A missing row is noMatch.
import { eq } from 'drizzle-orm'
import type { DrizzleD1Database } from 'drizzle-orm/d1'
import { catalogMatch, type CatalogLookup } from '../src/features/catalog-products/contract'
import { catalogProducts } from './schema'

export async function lookupCatalogProduct(
  db: DrizzleD1Database,
  gtin: string,
): Promise<CatalogLookup> {
  const [row] = await db
    .select({
      name: catalogProducts.name,
      strength: catalogProducts.strength,
      type: catalogProducts.type,
      status: catalogProducts.status,
    })
    .from(catalogProducts)
    .where(eq(catalogProducts.gtin, gtin))
  return row ? catalogMatch(row) : { outcome: 'noMatch' }
}
