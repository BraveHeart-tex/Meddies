import {
  normalizeGtin,
  parseBarcode,
  type CatalogLookup,
  type CatalogProductCommand,
} from './contract'

// Shared application boundary for the Catalog product lookup. Every lookup authenticates first;
// a value that is not a GTIN answers noMatch without reaching the Worker.
export function createCatalogProductOperations(dependencies: {
  requireUser: () => Promise<{ id: string }>
  send: (command: CatalogProductCommand) => Promise<CatalogLookup>
}) {
  return {
    async lookup(barcode: string | null): Promise<CatalogLookup> {
      const user = await dependencies.requireUser()
      const gtin = normalizeGtin(parseBarcode(barcode))
      if (!gtin) return { outcome: 'noMatch' }
      return dependencies.send({ operation: 'lookup', ownerId: user.id, gtin })
    },
  }
}
