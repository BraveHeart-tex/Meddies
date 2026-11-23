import { PrivateReadError } from '@/lib/session-check'
import { parseCatalogLookup, type CatalogLookup } from './contract'

export const catalogProductKeys = {
  /** One scanned barcode value's Catalog product, read once per Scanner read. */
  lookup: (barcode: string) => ['catalog-products', 'lookup', barcode] as const,
}

/** Browser read of a scanned barcode's Catalog product through the authenticated API route. */
export async function fetchCatalogLookup(
  barcode: string,
  signal?: AbortSignal,
): Promise<CatalogLookup> {
  const timeout = AbortSignal.timeout(12000)
  const response = await fetch(`/api/catalog-products?${new URLSearchParams({ barcode })}`, {
    cache: 'no-store',
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
  })
  if (!response.ok) throw new PrivateReadError(response.status)
  return parseCatalogLookup(await response.json())
}
