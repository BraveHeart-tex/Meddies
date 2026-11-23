// Runtime-neutral Catalog product lookup (#196, docs/product/catalog-barcode.md#scope). A scanned
// barcode value resolves to one Catalog product keyed by its GTIN-14, so a pack's GS1 DataMatrix
// GTIN and its printed EAN-13 or UPC-A find the same row. A result only fills the Add medicine
// form: a Medicine stores no barcode or catalog reference. Every response is
// `{ outcome: 'match', name, strength, type, supportedForm }` or `{ outcome: 'noMatch' }`.
import { isMedicineText } from '../medicines/contract'
import { isWritableMedicineType, type WritableMedicineType } from '../../lib/quantity-policy'
import { ApplicationError } from '../../lib/application-error'

/** A Catalog product's classification: whether its Type and form are known to Meddies. */
export const catalogStatuses = ['classified', 'unresolved', 'unsupported'] as const
export type CatalogStatus = (typeof catalogStatuses)[number]

export type CatalogMatch = {
  outcome: 'match'
  name: string | null
  strength: string | null
  type: WritableMedicineType | null
  supportedForm: boolean
}
export type CatalogLookup = CatalogMatch | { outcome: 'noMatch' }

export type CatalogProductCommand = { operation: 'lookup'; ownerId: string; gtin: string }

/**
 * EAN-8, UPC-A, EAN-13 or a 14-digit GTIN as a left-padded GTIN-14, or null when the value is
 * not one of them or its GS1 check digit fails. A GTIN-14 normalizes to itself.
 */
export function normalizeGtin(value: string): string | null {
  if (!/^(?:\d{8}|\d{12,14})$/.test(value)) return null
  const gtin = value.padStart(14, '0')
  // GS1 mod 10: weights 3 and 1 alternate leftwards from the digit before the check digit.
  let sum = 0
  for (let i = 0; i < 13; i++) sum += Number(gtin[i]) * (i % 2 === 0 ? 3 : 1)
  return (10 - (sum % 10)) % 10 === Number(gtin[13]) ? gtin : null
}

/** A stored Catalog product as its result: values Add medicine would reject read as null. */
export function catalogMatch(row: {
  name: string | null
  strength: string | null
  type: string | null
  status: CatalogStatus
}): CatalogMatch {
  const text = (value: string | null) => (isMedicineText(value) && value.trim() ? value : null)
  return {
    outcome: 'match',
    name: text(row.name),
    strength: text(row.strength),
    type: row.status === 'classified' && isWritableMedicineType(row.type) ? row.type : null,
    supportedForm: row.status !== 'unsupported',
  }
}

/** The route's `barcode` search parameter; any value that is not a GTIN looks up as noMatch. */
export function parseBarcode(value: string | null): string {
  if (value === null) throw new ApplicationError('validation', 400)
  return value
}

/** The Worker's command input: a normalized GTIN-14 only. */
export function parseGtin(value: unknown): string {
  if (typeof value !== 'string' || normalizeGtin(value) !== value)
    throw new ApplicationError('validation', 400)
  return value
}

export function parseCatalogLookup(value: unknown): CatalogLookup {
  const input = value as Record<string, unknown> | null
  if (input?.outcome === 'noMatch') return { outcome: 'noMatch' }
  const text = (field: unknown) => field === null || (typeof field === 'string' && field !== '')
  if (
    input?.outcome !== 'match' ||
    !text(input.name) ||
    !text(input.strength) ||
    !(input.type === null || isWritableMedicineType(input.type)) ||
    typeof input.supportedForm !== 'boolean'
  )
    throw new Error('catalog product contract')
  return {
    outcome: 'match',
    name: input.name as string | null,
    strength: input.strength as string | null,
    type: input.type,
    supportedForm: input.supportedForm,
  }
}
