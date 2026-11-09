import { copyFileSync, mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import type { NextConfig } from 'next'

// Self-host the Scanner's decoder on every `next` command, including builds whose install step a
// cache hit skipped. Resolving through the packages that load it keeps the WASM on their version.
function copyZxingWasm() {
  const fromRoot = createRequire(path.join(process.cwd(), 'package.json'))
  const fromScanner = createRequire(fromRoot.resolve('@yudiel/react-qr-scanner'))
  const fromDetector = createRequire(fromScanner.resolve('barcode-detector'))
  const wasm = fromDetector.resolve('zxing-wasm/reader/zxing_reader.wasm')
  const targetDir = path.join(process.cwd(), 'public/zxing')
  mkdirSync(targetDir, { recursive: true })
  copyFileSync(wasm, path.join(targetDir, path.basename(wasm)))
}

copyZxingWasm()

const nextConfig: NextConfig = {
  // Load Next.js guidance through the conditional AGENTS.md pointer.
  agentRules: false,
  typescript: {
    // The Verify typecheck step is the type gate, so the build need not repeat it.
    // Vercel and journey builds leave the variable unset and keep the check.
    ignoreBuildErrors: process.env.CI_SKIP_BUILD_TYPECHECK === '1',
  },
}

export default nextConfig
