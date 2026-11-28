// What a Scanner read means for Catalog lookup (#478, docs/product/catalog-barcode.md#scanner-rules).
// Each read is validated by its reported symbology before the Scanner freezes; anything else is
// ignored and the camera keeps running. From a DataMatrix only the extracted GTIN leaves this
// module: the raw text with its serial, expiry and batch is dropped here.
import type { IScannerProps } from '@yudiel/react-qr-scanner'
import { normalizeGtin } from '../catalog-products/contract'

/** Retail pack symbologies, and the DataMatrix that carries a GS1 GTIN on medicine packs. */
export const barcodeFormats: NonNullable<IScannerProps['formats']> = [
  'ean_13',
  'ean_8',
  'upc_a',
  'upc_e',
  'data_matrix',
]

const gs = '\u001d'

// Digit counts each symbology may report. The pinned detector reports UPC-A as a zero-prefixed
// `ean_13` and UPC-E already expanded, zero-prefixed. A compressed UPC-E (6 to 8 digits) is
// refused: as 8 digits it would otherwise pass as an EAN-8.
const retailLengths: Record<string, readonly number[]> = {
  ean_13: [13],
  ean_8: [8],
  upc_a: [12, 13],
  upc_e: [12, 13],
}

/**
 * The value to look up for one detected code, or null when it is not a supported pack barcode:
 * a retail barcode as printed once its GTIN validates, or the GTIN-14 of a supported DataMatrix.
 */
export function barcodeValue({
  format,
  rawValue,
}: {
  format: string
  rawValue: string
}): string | null {
  if (format === 'data_matrix') return dataMatrixGtin(rawValue)
  const lengths = retailLengths[format]
  if (!lengths?.includes(rawValue.length)) return null
  if ((format === 'upc_a' || format === 'upc_e') && rawValue.length === 13 && rawValue[0] !== '0')
    return null
  return normalizeGtin(rawValue) && rawValue
}

// Pack fields after the GTIN (Guide Art. 5(1), 6(3)): expiry is fixed length; serial and batch
// run to a GS or the end, so digits inside them are never read as another field.
const fixedField: Record<string, RegExp> = { '17': /^\d{6}/ }
const variableFields = new Set(['10', '21'])
const variableValue = /^[0-9A-Z]{1,20}$/

/**
 * The GTIN-14 of a GS1 element string shaped like a pack code: an optional `]d2` or leading GS,
 * then `01` and a valid GTIN, then only expiry, batch and serial, each at most once. The decoder
 * may return ordinary DataMatrix text bare too, so only this structure counts as a pack code.
 */
export function dataMatrixGtin(rawValue: string): string | null {
  let rest = rawValue.startsWith(']d2') ? rawValue.slice(3) : rawValue
  if (rest.startsWith(gs)) rest = rest.slice(1)
  const gtin = /^01(\d{14})/.exec(rest)?.[1]
  if (!gtin || !normalizeGtin(gtin)) return null
  rest = rest.slice(16)
  const seen = new Set<string>()
  while (rest) {
    const ai = rest.slice(0, 2)
    if (seen.has(ai)) return null
    seen.add(ai)
    rest = rest.slice(2)
    const fixed = fixedField[ai]
    if (fixed) {
      const value = fixed.exec(rest)?.[0]
      if (!value) return null
      rest = rest.slice(value.length)
      continue
    }
    if (!variableFields.has(ai)) return null
    const end = rest.indexOf(gs)
    if (!variableValue.test(end === -1 ? rest : rest.slice(0, end))) return null
    if (end === -1) break
    // A separator ends a variable field only when another field follows it.
    rest = rest.slice(end + 1)
    if (!rest) return null
  }
  return gtin
}
