// GS1 element string: optional symbology identifier and FNC1, then AI 01 and its 14-digit GTIN.
const gs1Gtin = /^(?:\]d2)?\u001d?(?:\(01\)|01)(\d{14})/

/** What a detected code means to its caller: the GTIN of a GS1 DataMatrix, else the printed value. */
export function barcodeValue({ format, rawValue }: { format: string; rawValue: string }): string {
  if (format !== 'data_matrix') return rawValue
  return gs1Gtin.exec(rawValue)?.[1] ?? rawValue
}
