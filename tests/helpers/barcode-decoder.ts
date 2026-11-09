import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'

// Resolved through the Scanner's own packages so tests decode with the version that ships.
const fromRoot = createRequire(path.join(process.cwd(), 'package.json'))
const fromScanner = createRequire(fromRoot.resolve('@yudiel/react-qr-scanner'))
const fromDetector = createRequire(fromScanner.resolve('barcode-detector'))

export const ponyfillPath = fromScanner.resolve('barcode-detector/ponyfill')

export function readDecoderWasm() {
  return readFileSync(fromDetector.resolve('zxing-wasm/reader/zxing_reader.wasm'))
}
