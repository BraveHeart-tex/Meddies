import { catalogProducts } from '@/features/catalog-products/server'
import { json, failure } from '@/lib/http'

export const runtime = 'nodejs'

// GET ?barcode= looks up a scanned barcode value's Catalog product. Every response is
// `{ outcome: 'match', name, strength, type, supportedForm }`, `{ outcome: 'noMatch' }` or
// `{ error }`.
export async function GET(request: Request) {
  try {
    return json(await catalogProducts.lookup(new URL(request.url).searchParams.get('barcode')))
  } catch (error) {
    return failure(error, 'catalog_product_request_failure')
  }
}
