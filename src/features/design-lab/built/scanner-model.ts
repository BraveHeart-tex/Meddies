import type { CatalogLookup } from '@/features/catalog-products/contract'

/**
 * `193·B·Scanner` lookups for the barcodes in tests/fixtures/barcodes: the EAN-13 is a full match,
 * named as the catalog holds it, and the GS1 DataMatrix's GTIN is a barcode Meddies doesn't know.
 */
export const scannerLookups: Record<string, CatalogLookup> = {
  '5901234123457': {
    outcome: 'match',
    name: 'MAJEZIK',
    strength: '100 mg',
    type: 'tablet',
    supportedForm: true,
  },
  '09501101530003': { outcome: 'noMatch' },
}
