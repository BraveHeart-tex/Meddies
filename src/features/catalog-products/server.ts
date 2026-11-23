import 'server-only'
import { sendStorage } from '@/lib/medicine-storage'
import { requireUser } from '@/features/auth/server'
import { ApplicationError } from '../../lib/application-error'
import { parseCatalogLookup, type CatalogProductCommand } from './contract'
import { createCatalogProductOperations } from './operations'

// Failure events carry fixed names only, never the barcode value.
export async function send(command: CatalogProductCommand) {
  try {
    return parseCatalogLookup(await sendStorage('/catalog-products', command))
  } catch (error) {
    if (error instanceof ApplicationError) throw error
    console.error('catalog_product_gateway_failure')
    throw new ApplicationError('unavailable', 503)
  }
}

export const catalogProducts = createCatalogProductOperations({
  async requireUser() {
    try {
      return await requireUser()
    } catch {
      throw new ApplicationError('unauthorized', 401)
    }
  },
  send,
})
