import { readFileSync } from 'node:fs'
import path from 'node:path'
import type { IDetectedBarcode } from '@yudiel/react-qr-scanner'
import { beforeAll, expect, test, vi } from 'vitest'
import { barcodeFormats, barcodeValue } from '../src/features/medicines/barcode-value'
import { ponyfillPath, readDecoderWasm } from './helpers/barcode-decoder'

type Detector = { detect(image: Blob): Promise<IDetectedBarcode[]> }
type Ponyfill = {
  BarcodeDetector: new (options: { formats: string[] }) => Detector
  setZXingModuleOverrides(overrides: { wasmBinary: ArrayBufferLike }): void
}

let detector: Detector

beforeAll(async () => {
  const { BarcodeDetector, setZXingModuleOverrides } = (await import(
    /* @vite-ignore */ ponyfillPath
  )) as Ponyfill
  vi.stubGlobal(
    'DOMRectReadOnly',
    class {
      constructor(
        readonly x: number,
        readonly y: number,
        readonly width: number,
        readonly height: number,
      ) {}
    },
  )
  setZXingModuleOverrides({ wasmBinary: readDecoderWasm().buffer })
  detector = new BarcodeDetector({ formats: barcodeFormats })
})

// Fixtures written by zxing-wasm: ean-13 5901234123457, ean-8 96385074, upc-a 036000291452,
// upc-e 01234565 (compressed), gs1-datamatrix (01)09501101530003(17)261231(10)AB12 and
// gs1-datamatrix-serial (01)08699536090115(21)AB12CD(17)271130(10)LOT9.
async function detect(fixture: string) {
  const bytes = readFileSync(path.join(process.cwd(), 'tests/fixtures/barcodes', fixture))
  const [code] = await detector.detect(new Blob([bytes], { type: 'image/png' }))
  return code!
}

// The detector's own output per symbology, which barcodeValue validates (#478).
test.each([
  ['ean-13.png', 'ean_13', '5901234123457'],
  ['ean-8.png', 'ean_8', '96385074'],
  ['upc-a.png', 'ean_13', '0036000291452'],
  ['upc-e.png', 'upc_e', '0012345000065'],
  ['gs1-datamatrix-serial.png', 'data_matrix', '010869953609011521AB12CD\u001d1727113010LOT9'],
])('%s decodes as %s %j', async (fixture, format, rawValue) => {
  await expect(detect(fixture)).resolves.toMatchObject({ format, rawValue })
})

test.each([
  ['ean-13.png', '5901234123457'],
  ['ean-8.png', '96385074'],
  ['upc-a.png', '0036000291452'],
  ['upc-e.png', '0012345000065'],
  ['gs1-datamatrix.png', '09501101530003'],
  ['gs1-datamatrix-serial.png', '08699536090115'],
])('%s is looked up as %s, a DataMatrix without its other fields', async (fixture, value) => {
  expect(barcodeValue(await detect(fixture))).toBe(value)
})
