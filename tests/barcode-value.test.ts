import { expect, test } from 'vitest'
import { normalizeGtin } from '../src/features/catalog-products/contract'
import { barcodeValue, dataMatrixGtin } from '../src/features/medicines/barcode-value'

// Format-aware parsing before lookup (#478, docs/product/catalog-barcode.md#scanner-rules).
// Catches a read the lookup cannot use reaching it, and DataMatrix text other than the GTIN
// leaving the Scanner.

const gs = '\u001d'

test.each([
  ['ean_13', '8699536090115', '08699536090115'],
  ['ean_13', '0036000291452', '00036000291452'], // UPC-A as the pinned detector reports it
  ['ean_8', '96385074', '00000096385074'],
  ['upc_a', '036000291452', '00036000291452'],
  ['upc_a', '0036000291452', '00036000291452'],
  ['upc_e', '012345000065', '00012345000065'], // expanded
  ['upc_e', '0012345000065', '00012345000065'], // expanded, as the pinned detector reports it
])('%s %s is looked up as printed and normalizes to %s', (format, rawValue, gtin) => {
  expect(barcodeValue({ format, rawValue })).toBe(rawValue)
  expect(normalizeGtin(rawValue)).toBe(gtin)
})

test('equivalent retail and DataMatrix reads normalize to one GTIN-14', () => {
  const reads = [
    { format: 'upc_a', rawValue: '036000291452' },
    { format: 'ean_13', rawValue: '0036000291452' },
    { format: 'data_matrix', rawValue: '010003600029145217271130' },
  ]
  const gtins = reads.map((read) => normalizeGtin(barcodeValue(read)!))
  expect(new Set(gtins)).toEqual(new Set(['00036000291452']))
})

test('a DataMatrix keeps leading zeros and a nonzero indicator digit', () => {
  expect(dataMatrixGtin('0100000096385074')).toBe('00000096385074')
  expect(dataMatrixGtin('011869980901885017271130')).toBe('18699809018850')
})

test.each([
  ['ean_13', '8699536090116', 'failed check digit'],
  ['ean_13', '036000291452', 'twelve digits'],
  ['ean_13', '08699536090115', 'fourteen digits'],
  ['ean_8', '9638507', 'seven digits'],
  ['ean_8', '96385075', 'failed check digit'],
  ['upc_a', '036000291453', 'failed check digit'],
  ['upc_a', '1036000291452', 'thirteen digits without the zero prefix'],
  ['upc_e', '01234565', 'compressed, eight digits'],
  ['upc_e', '123456', 'compressed, six digits'],
  ['upc_e', '1012345000065', 'thirteen digits without the zero prefix'],
  ['ean_13', '869953609011A', 'a letter'],
  ['qr_code', '8699536090115', 'an unsupported format'],
])('%s %s is ignored: %s', (format, rawValue) => {
  expect(barcodeValue({ format, rawValue })).toBeNull()
})

const gtin = '08699536090115'

test.each([
  ['bare', `01${gtin}21AB12CD${gs}1727113010LOT9`],
  ['after ]d2', `]d201${gtin}21AB12CD${gs}1727113010LOT9`],
  ['after a leading GS', `${gs}01${gtin}21AB12CD${gs}1727113010LOT9`],
  ['after ]d2 and a leading GS', `]d2${gs}01${gtin}1727113010LOT9`],
  ['GTIN alone', `01${gtin}`],
  ['fields in another order', `01${gtin}1727113010LOT9${gs}21AB12CD`],
  ['digits like an AI inside a serial', `01${gtin}21AB01${gtin}${gs}17271130`],
  ['digits like an AI inside a batch', `01${gtin}17271130101708699536090115`],
])('a pack DataMatrix yields only its GTIN: %s', (_, rawValue) => {
  expect(barcodeValue({ format: 'data_matrix', rawValue })).toBe(gtin)
})

test.each([
  ['parenthesized AIs', `(01)${gtin}(17)271130(10)LOT9`],
  ['explicit ordinary DataMatrix', `]d101${gtin}17271130`],
  ['other symbology identifier', `]Q301${gtin}`],
  ['ordinary text', 'Hello, pharmacy'],
  ['empty', ''],
  ['missing 01', `17271130${gs}10LOT9`],
  ['01 not leading', `17271130010${gtin}`],
  ['01 after a variable field', `21AB12CD${gs}01${gtin}`],
  ['duplicate 01', `01${gtin}01${gtin}`],
  ['duplicate field', `01${gtin}1727113017271130`],
  ['GTIN too short', '010869953609011'],
  ['failed GTIN check digit', '0108699536090116'],
  ['unsupported AI', `01${gtin}3103000189`],
  ['expiry too short', `01${gtin}1727113`],
  ['lowercase serial', `01${gtin}21ab12cd`],
  ['serial over 20 characters', `01${gtin}21${'A'.repeat(21)}`],
  ['empty batch', `01${gtin}10${gs}17271130`],
  ['trailing separator', `01${gtin}21AB12CD${gs}`],
  ['separator after the GTIN', `01${gtin}${gs}17271130`],
])('a DataMatrix yields nothing: %s', (_, rawValue) => {
  expect(barcodeValue({ format: 'data_matrix', rawValue })).toBeNull()
})
