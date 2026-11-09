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

// Fixtures encode 5901234123457 and (01)09501101530003(17)261231(10)AB12, written by zxing-wasm.
async function read(fixture: string) {
  const bytes = readFileSync(path.join(process.cwd(), 'tests/fixtures/barcodes', fixture))
  const [code] = await detector.detect(new Blob([bytes], { type: 'image/png' }))
  return barcodeValue(code!)
}

test('an EAN-13 pack reads as its printed value', async () => {
  await expect(read('ean-13.png')).resolves.toBe('5901234123457')
})

test('a GS1 DataMatrix reads as its GTIN, without the expiry or batch', async () => {
  await expect(read('gs1-datamatrix.png')).resolves.toBe('09501101530003')
})
